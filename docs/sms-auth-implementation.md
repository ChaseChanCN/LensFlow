# LensFlow 短信认证：实现与部署说明

客户端 agent 直接阅读 [短信 API 调用文档](sms-auth-api-v1.md)。本文说明服务端配置、数据迁移与验证边界。

## 一、实际使用的阿里云接口

用户提供的 [CreateSmsSign](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-createsmssign) 用于申请签名，不是发送验证码。现有签名与模板直接作为服务端配置使用，不在用户注册时创建签名。

发送使用 [SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms)，中国站固定 HTTPS endpoint `dysmsapi.aliyuncs.com`，API 版本 `2017-05-25`。使用已有 httpx 与标准库实现官方 [ACS3-HMAC-SHA256 签名协议](https://help.aliyun.com/zh/sdk/product-overview/v3-request-structure-and-signature)，没有新增 SDK 依赖。

| 用途 | 签名 | 模板 Code | 模板变量 |
|---|---|---|---|
| register | 时隙摄影工作室 | SMS_512571445 | code：6 位数字字符串 |
| login / 旧账号安全关联并登录 | 时隙摄影工作室 | SMS_512641429 | code：6 位数字字符串 |

模板内容由阿里云审核后的模板控制，客户端不能自定义正文。签名、模板的实际审核可用性尚未通过真实云调用核验。

## 二、服务端环境变量

只配置在后端环境或密钥管理系统，不能放在 VITE_、小程序包、HarmonyOS 包或公开仓库。`.env.example` 只有字段和非秘密的签名/模板参数。

```dotenv
SMS_ENABLED=true
SMS_ACCESS_KEY_ID=<受控 RAM / STS AccessKeyId>
SMS_ACCESS_KEY_SECRET=<AccessKeySecret>
SMS_SECURITY_TOKEN=<使用 STS 时填写，否则留空>
SMS_CODE_PEPPER=<独立随机秘密，至少32字符>
SMS_SIGN_NAME=时隙摄影工作室
SMS_REGISTER_TEMPLATE_CODE=SMS_512571445
SMS_LOGIN_TEMPLATE_CODE=SMS_512641429

AUTH_LEGACY_PASSWORD_ENABLED=false
APP_DEBUG=false

SMS_PHONE_HOUR_LIMIT=5
SMS_PHONE_DAY_LIMIT=10
SMS_IP_HOUR_LIMIT=20
SMS_GLOBAL_DAY_LIMIT=200
```

默认 `SMS_ENABLED=false`：未配密钥不发送、不生成可用于认证的调试码，接口返回 503。部署开通时再开启。`SMS_CODE_PEPPER` 不使用 JWT 密钥代替，应稳定保管；轮换会使在途验证码失效，并改变配额键，需在维护窗口处理。

推荐使用仅具备 `dysms:SendSms` 的 RAM 身份，不需要给运行时身份签名创建或模板管理权限。ST​S 临时三要素可用，自动刷新 STS 尚未实现。控制台预算、云端频控与应用/WAF 风控应配合部署；当前数据库配额用于明确限制发信规模，不代替全部反滥用设施。

阿里云请求连接超时 2s、读取超时 5s、禁止重定向和环境代理、响应体上限约 16KiB。SendSms 不保证幂等，因此网络不确定时不自动重试。OutId 使用 challenge_id 作关联标识，不把 OutId 当作供应商幂等键。

httpx 默认会记录包含手机号/code 的 RPC 查询 URL，适配器已为该供应商添加日志过滤；不记录请求参数、Authorization、验证码或云异常原文。生产关闭 APP_DEBUG，避免 SQL 调试日志暴露手机号等资料。

## 三、数据结构与迁移

新 head：`a8c0e2f4b656`，前置 `f7b9d1e3a545`。

- User 仍是唯一业务身份；email/password_hash 允许空值，手机号账号不伪造邮箱或密码。既有账号字段不清空。
- PhoneIdentity：规范化 +86 手机号主键，user_id 唯一外键，记录验证时间。历史 User.phone 不会自动导入该表。
- SmsChallenge：随机 128 bit ID、手机号、用途、HMAC 验证摘要、发送状态、尝试次数、UTC 到期与消费时间。不保存验证码明文。
- SmsRateBucket：数据库原子 UPSERT + 条件增加计数，覆盖跨 worker 的全局/手机号/IP 配额。另有稳定手机号行锁保护跨时间窗的 60 秒重发冷却。

验证码 HMAC 绑定 challenge_id + phone + purpose + code，秘密只在服务器。校验通过后，验证码消费与创建/关联身份处于同一事务；并发不能重复消费或产生两个手机号身份。校验失败的尝试次数会提交，不会因抛异常而回滚。

SMS 发送前先提交配额和发送保留记录，等待外部网络时不持有数据库事务。明确失败不可认证；结果未知时，只有实际收到正确 code 才能认证。成功的阿里云提交后验证码 TTL 为 300 秒。

每次发信有界清理最多 200 个过期 challenge 和 200 个过期配额桶；challenge 到期后保留约一天再清理，配额桶按窗口/锁有效期保留，未引入后台队列或 Redis。

### 部署顺序

1. 审核并备份目标数据库；本次没有自动升级开发数据库。
2. 在隔离或已授权部署环境安装现有依赖，执行审核后的 Alembic upgrade；验证 `/ready`。
3. 配置服务端凭据、独立 pepper 和用户提供的签名/模板；核对阿里云审核与配额。
4. 部署新客户端。需要暂时兼容旧客户端时，明确开启 `AUTH_LEGACY_PASSWORD_ENABLED=true`；完成迁移后关闭。
5. 用明确授权的测试手机号执行真实短信发送、收码、注册、登录和旧账号关联验收。隔离 sender 测试不能代替这一项。

```powershell
# 仅对已经授权、备份并审核的部署目标执行；不要改指向开发/生产库试验。
python -m alembic upgrade head
```

SQLite 会重建 users 以放宽两列约束，必须停应用后用离线 Alembic 连接执行。迁移在 foreign_keys=ON 时直接拒绝 users 重建，避免关联表被级联删除；现有 Alembic 独立连接默认 OFF，迁移后执行 foreign_key_check。隔离测试验证已有用户和引用用户的重试记录保留。

若已经创建 email/password 为空的手机号用户，降级到旧非空结构会丢失语义，因此 downgrade **在任何删表前拒绝**。应使用审核过的备份恢复或先进行受控身份迁移，不能删除用户来强行降级。

## 四、既有账号与管理员

旧账号关联必须同时证明原邮箱密码和新手机号验证码；成功保留 User.id、role、订单与照片关联。不能仅凭历史 User.phone 归属旧账号，不能自动合并两个 User，也没有公开换绑/找回接口。

管理员禁止通过短信注册、登录或关联。已有管理员保留正确密码登录；独立受控创建流程不变。普通用户邮箱注册/登录默认关闭，兼容标志只用于明确过渡。

JWT 结构、鉴权依赖、有效期与现有业务权限保持。UserResponse.email 现在可为 null，前端 agent 必须调整类型。没有新增 refresh、设备 session 撤销或 cookie 认证。

## 五、修改文件

新增：

- `backend/app/models/sms_auth.py`
- `backend/app/schemas/sms_auth.py`
- `backend/app/services/aliyun_sms.py`
- `backend/app/services/sms_auth.py`
- `backend/alembic/versions/a8c0e2f4b656_sms_auth.py`
- `backend/tests/test_sms_auth.py`
- 本说明及 `docs/sms-auth-api-v1.md`

调整：auth 路由与响应 schema、User 两列空值约束、verify_password 空密码安全处理、Settings、models 导出、schema_readiness、`.env.example`。原有测试夹具和 PG sandbox 显式开启旧密码兼容并关闭真实发信，以继续隔离地验证历史业务；短信专项另行关闭旧密码入口并注入捕获 sender。

未修改客户端仓库、前端页面、首页粒子、设计系统、照片处理算法或既有业务模型关联；未自动改写真实用户数据。

## 六、验证记录

首轮短信专项 17 项通过。增加实际 TCP 与管理员/失败场景后发现一个测试断言放错函数的 NameError，已修正；最终结果见 `sms-auth-evidence`。

自动化验证范围包括：+86 字符串格式、注册/登录用途隔离、角色边界、过期/5 次上限、一次性消费、并发发信冷却与并发消费、旧账号双重证明、绑定冲突、供应商明确失败/未知结果、RPC 日志脱敏、SQLite 迁移保留关联与阻止有损降级。

实际 TCP 验证运行在隔离 SQLite 与临时本机端口，真实经过 HTTP 注册、me、重放拒绝及客户预约/摄影师确认/订单读取。仅外部短信发送方被替换为内存捕获器，没有调试取码 API，也没有发送实际短信。

当前真实阿里云发送尚未联调；本轮未执行真实 PostgreSQL 短信专项，不把以往 P3-D2 的 PG 结果当作本次结果。实际运行的命令、最终数量与数据保护记录将在证据目录与最终交付中列明。
