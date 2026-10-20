# LensFlow +86 短信注册 / 登录：客户端调用文档

本文可直接交给实现 Web、小程序或 HarmonyOS 客户端的 agent。它取代 P3-D2 文档中的普通用户邮箱密码注册/登录约定；订单、选片、媒体等业务 API 与 JWT 用法保持。

## 0. 接入状态与边界

- 后端已实现；客户端页面由另一个 agent 完成，本次未修改任何客户端代码。
- 默认普通用户只使用 +86 短信注册/登录；保留 client（客户）、photographer（摄影师）两种普通注册角色。禁止短信注册/登录管理员。
- **不是“手机号 + 密码”**，也不会让客户端自己生成或校验验证码。
- 账号、订单、照片仍关联同一个 User.id，没有小程序独立用户库。
- 需要部署新迁移 `a8c0e2f4b656`，配置服务端密钥并开启短信后，接口才能实际发信。本次没有自动迁移开发数据库，也没有发送真实短信。
- 不存在调试取码接口、固定万能验证码或生产 mock 登录。

## 1. 基础约定

API 基址由部署提供，以下路径已包含 `/api/v1`。请求和响应为 JSON，生产必须 HTTPS。

手机号只接受：

```text
13800138000
+8613800138000
```

服务端统一存为 `+86` + 11 位号码。只允许字符串；不接受其他国家/地区、0086、空格分隔、逗号批量号码或数值类型。以上为格式示例，真实发送必须换成你有授权的测试手机号，不要直接给示例号发短信。

验证码为 **6 位数字字符串**，保留前导零，有效期 5 分钟，每个 challenge 最多 5 次校验，成功只消费一次。错误、过期、用尽或重放均不能登录。

手机号、用途、challenge_id、code 必须一起对应。注册验证码不能拿来登录，登录验证码也不能直接注册。

## 2. 发送验证码

### `POST /api/v1/auth/sms/codes`

鉴权：公开，无需 JWT。发送受数据库持久化频控保护，不依赖某个服务进程的内存缓存。

请求：

```json
{
  "phone": "+8613800138000",
  "purpose": "register"
}
```

| 字段 | 类型 | 要求 |
|---|---|---|
| phone | string | +86 或 11 位中国大陆手机号 |
| purpose | string | `register` 或 `login` |

不接受其他字段。**客户端不传签名、模板、短信正文、AccessKey、用户 ID 或 IP。**

成功：HTTP **202**。

```json
{
  "challenge_id": "9a46e13983444d259e9e72b515c69ea4",
  "expires_in": 300,
  "resend_after": 60,
  "delivery_status": "accepted"
}
```

202 / accepted 表示短信发送 API 接受请求，不表示手机已收到，更不表示手机号已验证。响应不会返回验证码。客户端保存 challenge_id 和当前 purpose，开始 60 秒倒计时；验证码仍由用户从短信中输入。

同一手机号跨注册/登录用途共用重发冷却。默认每号 60 秒一次、每号 5 次/UTC 小时及 10 次/UTC 日、每 IP 20 次/UTC 小时、全站 30 次/UTC 分钟及 200 次/UTC 日。除 60 秒冷却为滑动间隔外，其余为固定 UTC 窗口，部署可调整部分配额。短信失败/结果未知也占用发送配额，避免反复重试计费。

### 发送结果不确定

阿里云 SendSms 不提供幂等保证。网络超时可能已发出短信，后端不会自动重试。HTTP 503：

```json
{
  "code": "SMS_SEND_UNCERTAIN",
  "message": "短信发送结果尚未确认，请勿重复点击",
  "detail": {
    "challenge_id": "9a46e13983444d259e9e72b515c69ea4",
    "expires_in": 300,
    "retry_after": 60
  }
}
```

客户端应保留该 challenge_id，提示“结果未确认，若已收到可填写验证码”，同时执行冷却，不能自动重发。只有真的收到并正确输入验证码才可认证。明确发送失败为 `SMS_SEND_FAILED`，该 challenge 不可认证。

## 3. 注册

### `POST /api/v1/auth/register`

鉴权：公开，必须使用 **register** challenge。

```json
{
  "phone": "+8613800138000",
  "challenge_id": "9a46e13983444d259e9e72b515c69ea4",
  "code": "012345",
  "name": "张三",
  "role": "client"
}
```

| 字段 | 类型 | 要求 |
|---|---|---|
| phone | string | 与发送验证码一致，11 位和 +86 会规范化为同一号码 |
| challenge_id | string | 发送接口返回的 32 位小写十六进制字符串 |
| code | string | 6 位数字，不能转换成 Number |
| name | string | 1..100 字符 |
| role | string | `client` / `photographer`，省略为 client；不允许 admin |

成功：HTTP **201**，立即获得登录会话。

```json
{
  "access_token": "<LensFlow JWT>",
  "token_type": "bearer",
  "user": {
    "id": 42,
    "email": null,
    "name": "张三",
    "role": "client",
    "phone": "+8613800138000",
    "created_at": "2026-10-19T02:00:00"
  }
}
```

`created_at` 保留现有 auth DTO 的无后缀 UTC 约定，客户端按 UTC 解释。手机号账号没有伪造邮箱或密码，**email 可以为 null**；客户端 User 类型必须改为 `string | null`，不要用 email 作为全站唯一身份键，使用 user.id。

手机号已经注册：409 `PHONE_ALREADY_REGISTERED`，不会更改已有账号的角色。提示用户切换登录，并重新获取 login 用途验证码。成功认证后的验证码不能重放；丢失成功响应后应重新取码，不要无限重试旧 code。

## 4. 登录

### `POST /api/v1/auth/login`

鉴权：公开，必须使用 **login** challenge。请求不传 role、name、email 或 password。

```json
{
  "phone": "+8613800138000",
  "challenge_id": "9a46e13983444d259e9e72b515c69ea4",
  "code": "012345"
}
```

成功：HTTP **200**，TokenResponse 与注册成功相同。role 只能来自数据库，不能由客户端覆盖。普通短信登录不自动注册，不合并旧账号。

没有已验证手机号身份、账号停用或管理员尝试短信登录均拒绝。普通用户提示可选择注册或“原邮箱账号关联手机号”，不能通过查找历史 User.phone 自动认领账号。

## 5. 原邮箱账号：安全关联并登录

历史 phone 是用户自行填写的资料，不代表验证过。为保留原有订单/照片/草稿，已有用户应优先使用本流程，避免新注册成另一个 User。

### `POST /api/v1/auth/sms/link-login`

1. 使用上述发送接口获取 `purpose=login` 的验证码。
2. 同时提供旧邮箱账号的正确密码和该手机的验证码。

```json
{
  "phone": "+8613800138000",
  "challenge_id": "9a46e13983444d259e9e72b515c69ea4",
  "code": "012345",
  "email": "existing@example.com",
  "password": "<旧账号密码>"
}
```

成功：200 TokenResponse，**User.id 与原账号相同**，原订单、照片及角色保留；之后可直接短信登录。该操作是“使用新手机号验证旧账号并登录”，发送登录模板，不自动注册新账号。

手机号属于其他已验证用户，或旧账号已绑定另一号码：409 `PHONE_IDENTITY_CONFLICT`。不能自动合并、转移手机号、覆盖身份或替用户换绑；需受控人工恢复流程。忘记旧密码不能仅凭历史手机号取回旧账号，本阶段没有密码找回接口。

管理员不走短信关联；保留受控密码登录。普通邮箱密码注册/登录默认关闭；`AUTH_LEGACY_PASSWORD_ENABLED=true` 仅作为部署明确开启的兼容过渡，不是客户端应依赖的常态。

## 6. JWT 与后续请求

```http
Authorization: Bearer <access_token>
```

- `GET /api/v1/auth/me`：当前用户，email 可空。
- `POST /api/v1/auth/logout`：沿用原语义，客户端清除会话；不是服务端逐 token 撤销。
- 默认 JWT 有效期 1440 分钟，以后端配置为准。没有新增 refresh 接口。
- 订单、客户图库、选片 CAS、媒体票据继续使用同一个 JWT。不要向短信供应商发送 LensFlow JWT。
- 手机验证码不要写入日志、埋点、URL、持久化缓存或分享链接；登录后清空验证码输入与 challenge。
- 客户端不放任何阿里云密钥，也不能直接调用阿里云 SendSms/CreateSmsSign。

## 7. 错误处理

业务错误沿用 `{code,message,detail}`；schema 错误仍是 FastAPI 的 422 detail 数组。

| HTTP / code | 客户端处理 |
|---|---|
| 202 accepted | 保存 challenge_id，倒计时，等待用户填写真实验证码 |
| 401 UNAUTHORIZED | 验证码错误/过期/已消费/用尽，或身份凭据无效；保留 phone，提示重试或重新取码 |
| 403 FORBIDDEN | 普通密码入口已关闭，使用短信；不重试旧密码接口 |
| 409 PHONE_ALREADY_REGISTERED | 切换登录，重新获取 login 用途验证码 |
| 409 PHONE_IDENTITY_CONFLICT | 不自动覆盖、合并或换绑，提示受控处理 |
| 422 | 手机号/6 位 code/用途/role/必填字段不合法；修正输入 |
| 429 SMS_RATE_LIMIT | 读取 `detail.retry_after`，禁用重复点击，不能靠换 purpose 绕过 |
| 503 SMS_NOT_CONFIGURED | 后端配置未就绪；不要显示“发送成功”或退化到模拟验证码 |
| 503 SMS_SEND_FAILED | 明确发信失败；遵守冷却，人工重试 |
| 503 SMS_SEND_UNCERTAIN | 保留返回的 challenge_id；若已收到允许填写，不能自动重发 |
| 503 DATABASE_UNAVAILABLE | 不自动重复发送短信，提示服务繁忙 |

验证错误对验证码和手机号组合使用统一信息，客户端不要根据“发送成功”猜测账号是否存在。只有证明手机控制权后才可能得到已注册等业务结果。

## 8. TypeScript 接入骨架

以下不依赖 React，仅说明真实 wire contract；把 request 替换为现有认证 HTTP 客户端。

```ts
type SmsPurpose = 'register' | 'login'
type Role = 'client' | 'photographer'
type SmsProof = { phone: string; challenge_id: string; code: string }
type SmsChallenge = {
  challenge_id: string
  expires_in: number
  resend_after: number
  delivery_status: 'accepted'
}
type AuthResult = {
  access_token: string
  token_type: 'bearer'
  user: {
    id: number; email: string | null; name: string
    role: 'client' | 'photographer' | 'admin'
    phone: string | null; created_at: string
  }
}

const sendCode = (phone: string, purpose: SmsPurpose) =>
  request<SmsChallenge>('POST', '/api/v1/auth/sms/codes', { phone, purpose })
const smsLogin = (proof: SmsProof) =>
  request<AuthResult>('POST', '/api/v1/auth/login', proof)
const smsRegister = (proof: SmsProof, name: string, role: Role) =>
  request<AuthResult>('POST', '/api/v1/auth/register', { ...proof, name, role })
const linkOldAccount = (proof: SmsProof, email: string, password: string) =>
  request<AuthResult>('POST', '/api/v1/auth/sms/link-login', { ...proof, email, password })
```

注意：purpose/phone 变化后不能复用旧 challenge；倒计时状态应绑定规范化手机号，而非仅当前 tab。不要把 code 转数字或把验证码响应当作登录成功。

## 9. 给客户端 agent 的实施清单

1. 注册页改为 +86 手机号、短信码、姓名、客户/摄影师；登录页改为 +86 手机号和短信码。
2. 发送成功保存 challenge，防止重复点击；覆盖 429、503 uncertain、未配置错误。
3. 严格区分 register/login 用途，切 tab 不绕过同号码冷却。
4. 注册/登录成功沿用现有 auth store 和角色路由；User.email 改成可空，展示优先 name/phone。
5. 提供“原邮箱账号关联手机号并登录”入口，保留原 User.id。密码只提交 link-login，不存储。
6. 不直接调用阿里云；不添加验证码回显、固定测试码或客户端校验放行。
7. 在已迁移、已配置的后端上用明确授权的真实测试手机号完成发信联调。本次隔离测试不等于阿里云真实发信验收。

后端配置与迁移注意事项见 [部署说明](sms-auth-implementation.md)。
