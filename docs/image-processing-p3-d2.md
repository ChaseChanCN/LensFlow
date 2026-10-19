# LensFlow P3-D2 实施与验收报告

## 结论

已在既有业务模型上实施客户 API 桥接：复用真实客户认证、增强预约持久幂等、新增订单与已发布照片的分页投影、增加选片草稿 CAS、提供短时私有媒体票据与最终文件流式下载，并修复相关旧 Web 入口的对象归属缺口。

**外部微信登录和小程序真机联调尚未验收。** 没有生产 mock 微信登录；没有把修图草稿、内部 RetouchVersion 或预览当成最终交付。实际路由和客户端接入见 [统一契约](mobile-customer-api-v1.md)、[CodeArts 交接](api-bridge-p3-d2-handoff.md)，审计基线见 [审计报告](api-bridge-p3-d2-audit.md)。

## 1. 仓库与数据库边界

- 分支：`design-system`。开始时已有 C3/D1/C4 未提交改动，未重置、清理、提交或覆盖这些工作。
- D2 前文件哈希与 Git 状态：`.agentwork/p3-d2/before.json`、`git-before.txt`。
- 实际旧 Alembic head：`e6a8c0d2f434`；本阶段新 head：`f7b9d1e3a545`。
- 新迁移仅增加 `booking_request_keys`、`customer_selection_drafts`，没有修改既有业务表或历史迁移，没有回填客户数据。
- 开发 SQLite 仍为 `5e0b2fd720d3`；仅只读核对版本与文件哈希，本阶段未对其迁移。
- SQLite 测试由 `tests/conftest.py` 在导入应用前创建随机临时根目录，数据库、uploads、后台 SessionLocal 与通知均隔离；create_all/drop_all 只作用于该临时库。
- PostgreSQL 使用真实本机 14/5433。沿用 OwnedPostgres：随机新库、nonce/OID/owner 验证、template0、有限连接与语句超时；不在 postgres 维护库或现有业务库运行迁移。
- 实测版本 14.24，UTF8；collation/ctype 均为 `English_United States.936`，locale provider=c。服务器 TimeZone=Asia/Shanghai，应用连接 TimeZone=UTC；真实 timestamp 测试通过。见 `server.json`。
- 密码由本机隐藏输入框提供，只在协调进程内存中保存；没有写入参数、源代码、日志或 JSON。每个 PostgreSQL job 的实际数据库与临时根目录见 `*-environment.json`，清理见 `*-result.json`。
- WeChat/HarmonyOS 仓库未写入。再次只读检查仍未找到 WeChat 的 integration-requests 或 api-contract-audit 文件，不编造 M0 对账结果。

## 2. 实际文件清单

### 新增后端代码

| 文件（相对于仓库） | 职责 |
|---|---|
| `backend/app/api/v1/customer.py` | 窄 DTO 的订单/预约/照片分页、选片与媒体/交付适配器 |
| `backend/app/schemas/customer.py` | 跨客户端明确白名单、严格字段和媒体 scope |
| `backend/app/services/customer_workflow.py` | 共享对象权限、预约幂等、选片规则/CAS/原有提交副作用 |
| `backend/app/services/customer_media.py` | 签名票据、实时授权、限流、规范化预览与有界字节流 |
| `backend/app/models/customer_bridge.py` | 两个伴随可靠性状态模型 |
| `backend/alembic/versions/f7b9d1e3a545_customer_bridge.py` | 从实际 head 增量升级/回退 |
| `backend/scripts/verify_customer_bridge_http.py` | 经新随机库安全验证后运行真实 TCP 客户全流程 |
| `backend/tests/test_customer_bridge.py` | 真实 JPEG、权限、幂等、CAS、票据、字节完整性与失败清理 |
| `backend/tests/postgres/test_customer_bridge.py` | 复用真实契约断言、约束/回退与并发竞争 |

### 修改现有后端

- `api/v1/bookings.py`：可选请求幂等键；预约读/改/取消/确认统一归属；pending 条件更新，避免竞争确认重复创建 Order。
- `api/v1/orders.py`：订单详情、历史和变更补对象归属；条件状态更新；客户不能借通用状态 API 绕过选片校验。
- `api/v1/selections.py`、`schemas/selection.py`：发布权限、时区/配额约束、读取版本与草稿；旧 submit 调同一领域服务。
- `api/v1/deliveries.py`：上传/归档归属、发布检查、有界读、流式下载、事务失败补偿删除本次上传文件。
- `api/v1/retouch.py`：任务、版本、反馈、确认等旧入口补真实 Order 归属；客户不获得内部 key 或未发布版本列表。
- `api/v1/photos.py`：旧客户列表不再返回 storage_key，摄影师原有 DTO 保持。
- `services/storage.py`：独占写入失败时仅清理本次已创建的残片，不删除重名既有文件；接口签名未改变。
- `deps.py`：非法 JWT subject 安全返回 401，不发生 int 转换 500。
- `core/exceptions.py`：结构化冲突 detail；数据库异常 503 脱敏。
- `main.py`：注册桥接路由及 SQL 异常处理，API 私有缓存响应头。
- `models/__init__.py`、`services/schema_readiness.py`：导出模型、检查新 head 与两个伴随表；启动不自动迁移。
- `schemas/booking.py`：明确 YYYY-MM-DD 日期、有限时长≤24 小时、活动摄影师引用校验由服务执行。
- 测试：`tests/test_orders.py` 修正旧“可读其他客户预约”的不安全断言；`tests/test_metadata_overlay.py`、`tests/postgres/test_runtime.py` 从实际 ScriptDirectory 获取 head，避免写死旧版本。

### Web 最小适配

- `frontend/src/api/selections.ts`：添加 revision/draft/submitted，提交传 expected_revision。
- `frontend/src/pages/client/SelectionPage.tsx`：恢复共享草稿，保留本地修改所基于的版本；冲突后显式重新读取；读取失败不丢弃本地选择；提交后禁止继续编辑。
- `frontend/src/api/deliveries.ts`：storage_key 可选，兼容客户响应脱敏。
- 对应 SelectionPage、DesignSystemMigration 测试覆盖草稿恢复、版本提交、冲突保持与显式重载。
- 没有新增前端路由，没有更改全局设计系统、首页粒子、摄影师像素算法或编辑状态模型。

## 3. 认证、共享模型与并发

### 身份

复用 `/auth/register`、`login`、`me`，真实 User/client 是身份权威。公开注册已经只允许 client/photographer，本阶段不建立第二套身份库。JWT 默认 24 小时，多设备可独立登录；logout 不实现服务端逐 token 撤销。禁用用户每请求立即复核。

微信 code 交换与显式账号绑定仅为提案：需要真实 AppID/AppSecret、双重证明和已确认的绑定规则，不能相信客户端 OpenID 或 user_id。没有开放假的微信登录端点；因此微信 exchange mocks 不适用于本次未实施功能。

### 预约

继续使用 Booking。没有排期、定价、押金，不把意向 preferred_date 说成可用时段。可选 Idempotency-Key 持久保存客户/键摘要/载荷摘要/实际 Booking 引用/24h 到期；客户行序列化 + 唯一约束保护并发。同请求返回同一预约当前状态，异载荷 409，丢响应可恢复；每客户最多 100 个有效键，有界清理。旧 Web 不传键保持可用。

摄影师确认使用权威 Booking 的 pending 条件更新，再在同一事务创建 Order。身份只取 JWT 查询出的摄影师，不能用请求中的 photographer_id 冒充别人。

### 选片

SelectionItem 仍是摄影师提供的照片，不是客户标注；SelectionSubmission 仍保存最终选择。新增 CustomerSelectionDraft 只保存 selected IDs、revision、owner、updated_at。

GET 无写副作用，初始 revision=0。每次修改比较版本、校验发布/截止/状态/配额/真实 Photo→Order 关联/成员资格/重复 ID。客户及订单行锁与条件 UPDATE 使跨设备旧版本返回 409+current，不能静默覆盖。成功提交沿用原状态机与 RetouchTask、Timeline、Submission 事务；重复桥接 submit 返回既有结果，不重复副作用。旧 Web submit 也受相同 CAS 保护，重复提交保留原 409。

## 4. 媒体和交付

订单/照片目录使用 SQL keyset 分页，limit≤50，稳定 id 升序。订单投影用关联查询和 EXISTS 计算 availability，不逐订单加载整个相册。照片目录只选已发布 SelectionItem，客户 DTO 不包含摄影师标记、编辑参数、GPS、序列号、私有描述或文件 key。

票据只由已认证客户申请，HS256 + 独立 audience，绑定 user/order/media/kind/variant/size/source identity；120 秒可复用。下载只接受请求头，不含敏感 query，不重定向，不允许任意路径、原图变体或 storage_key。每次兑换重新查活动用户、角色、订单归属与发布/资源身份，支持即时拒绝后续撤销请求；传输中不承诺逐块召回。

每 worker 60 票据/客户/分钟、最多 4096 个 admission 桶、最多 4 个媒体读取，图像重渲染另有现有单 render_slot；这些有界本机限流不冒充分布式全局配额。预览最长边≤1024，缩略图 128/256/512；复用现有尺寸/像素限制和缓存，冷缓存有界解码，命中不重解码全图。

交付只能来自真实 Delivery 且订单 DELIVERED/ARCHIVED。JPEG 安全预览，JPEG/PNG/既有 ZIP 按原字节下载，100MiB 上限、64KiB 分块；没有压缩包生成。文件缺失与依赖失败明确返回，不伪装成功。EXIF 等嵌入信息随最终文件字节保留，摄影师须在发布前决定最终文件的可交付内容；安全预览不携带 EXIF/GPS。

## 5. 实际验证与发现的失败

| 验证 | 结果与证据 |
|---|---|
| SQLite 完整收集 | 38 文件 / 749 节点，4 个隔离分组。初轮 1 失败：C4 迁移断言写死旧 head；修复后以同一节点复测替换，最终 590 passed / 159 skipped / 0 failed。保留原 XML 与复测 XML；不是声称初轮全绿 |
| 最新 SQLite 专项 | 64 passed / 1 skipped；65 个节点覆盖新桥接、交付、存储与迁移断言。`sqlite-final.xml` |
| 真 PostgreSQL 完整回归 | 173 passed / 0 skipped；`postgres-complete.xml`，含原 C3/D1/C4 元数据回归与 D2，并非 SQLite 代替 |
| 最新 PostgreSQL 专项 | 42 passed / 0 skipped，95.24s；最新清理/回滚/越权写入断言再次执行。`postgres-final.xml` |
| 真实 TCP | 最终代码再次通过 62 请求 / 17 检查点；真实认证、预约、发布、选片、修图、交付、撤销和真实 JPEG。`http.json`、`http-final-result.json` |
| Web 完整回归 | 独立 threads 池完整重跑：58 文件 / 344 passed / 0 errors，170.59s；`frontend-final.xml`、`frontend-final-result.json` |
| TypeScript / 生产构建 | 两者退出码 0；`typescript.log`、`build.log`、`final-checks.json` |
| lint | 退出码 0，4 条原有警告：DarkroomVideoBackground 两条 effect、AssetGrid 兼容库、ParticlePortrait effect 依赖；未为此改动这些受保护模块 |

SQLite 的 159 skips：158 个 PostgreSQL 专项节点在普通 SQLite 收集中不执行；另 1 个是本机未允许测试符号链接。PostgreSQL 专项在自己的真实隔离进程执行。非通过项未被计为通过。

初次旧业务回归 43 通过 / 1 失败来自旧安全断言预期 200，现统一改为跨客户 403。新增桥接初轮 34 通过 / 1 失败发现冲突时间未 JSON 序列化，已修复并复测。首次 HTTP 验证使用测试保留域名被 EmailStr 拒绝，调整为隔离账户的 example.com 后实际全流程通过；没有跳过验证或放宽邮箱校验。首次 Web 专项有一项重复文本定位歧义，改用 status 角色查询。完整 Web 首轮 314 项通过，但两个测试文件的 forks worker 启动超时，不能算全量通过；随后独立使用 threads 池重跑完整集合，保留两轮日志。

最终完整 Web 重跑无未处理错误；本阶段核心后端文件的定向 Ruff 检查通过。没有安装新依赖。

### 命令

```powershell
# 正常测试：原隔离 conftest，完整文件分区清单和每组命令见 sqlite-partitions.json / .agentwork 脚本
.\.agentwork\design-system\p5-venv\Scripts\python.exe .agentwork/p3-d2/run_sqlite_partitioned.py

# 最新 SQLite 复测，在 backend 目录（python 为上述 venv）
python -m pytest -q tests/test_customer_bridge.py tests/test_deliveries.py tests/test_storage.py tests/test_storage_security.py tests/test_metadata_overlay.py::test_overlay_migration_sqlite_roundtrip --junitxml=../docs/image-processing-p3-d2/sqlite-final.xml

# 仅在协调进程提供的、新随机且已验证的 PG capability 环境中，在 backend 目录
python -m pytest -c tests/postgres/pytest.ini --confcutdir=tests/postgres tests/postgres -q -ra --junitxml=../docs/image-processing-p3-d2/postgres-complete.xml
python -m pytest -c tests/postgres/pytest.ini --confcutdir=tests/postgres tests/postgres/test_customer_bridge.py -q -ra --junitxml=../docs/image-processing-p3-d2/postgres-final.xml
python -m scripts.verify_customer_bridge_http --output ../docs/image-processing-p3-d2 --port 8057

# frontend 目录
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=default --reporter=junit --outputFile=../docs/image-processing-p3-d2/frontend.xml
node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=2 --reporter=default --reporter=junit --outputFile=../docs/image-processing-p3-d2/frontend-final.xml
node node_modules/typescript/bin/tsc -b --pretty false
npm run build
npm run lint
```

PG 命令不得脱离安全启动器改指向已有数据库；密码只在本机交互输入。没有运行测试就声明通过的步骤。

## 6. 真实 HTTP、性能与原图

使用 `tests/fixtures/grace_hopper.jpg`：真实照片，517×606、73746 字节。

SHA-256：`e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a`。上传后原文件、预览/选择后原文件及最终下载字节 SHA 一致；不修改 Photo.storage_key 或原始文件内容。

验证通过真实 HTTP 操作推进业务，不直接伪造已交付状态。只有专用大相册性能夹具在随机测试库插入额外 1000 条 Photo/SelectionItem，形成 1001 张、21 页；每页≤50，未把整个相册加载后在 Python 过滤。订单 SQL 查询数≤3（含认证），契约测试监控实际 SQL 的 LIMIT，并校验跨客户和私有字段。

单机 TCP 分页耗时记录在 `http.json`，只是本机样本，不推导生产吞吐或 SLA。票据在关闭/禁用客户后再次兑换被拒绝，scope query/tamper/expiry 也实际拒绝。

最终 21 页实际 TCP 延时：最小 22.75ms、中位 46.75ms、最大 86.95ms，见 `performance.json`。这些是单机回环、1001 条目录记录的样本。

数据保护见 `protection.json`：301 个基线文件中 19 个预期源文件修改，其余 282 个逐个哈希未变，包括 189 个其他前端源码、13 个 public 文件、6 个历史迁移、开发 SQLite。测试文件修正与新增文件另见清单。全局设计系统、首页粒子与图像处理算法没有变化。

开发 SQLite SHA-256 为 `5c923e9d00775cc54a40d44e00c718146bc4858767fe5474fbadff5b757d1fef`，版本仍 `5e0b2fd720d3`。六次 PG job（含首次失败 HTTP）的随机库与临时目录均已确认清理。`database-protection.json` 确认三个原有数据库的 identity/locale 清单在协调进程重启前后及最终均一致，没有遗留本阶段新库。维护连接仅执行目录查询，不对原有库进行迁移或业务写入。

额外执行 `python -m pytest tests/test_isolation.py -v -s`，3 项通过。该轮实际数据库为 `C:/Users/Chase/AppData/Local/Temp/lensflow-pytest-73nqg5tu/test.sqlite`，实际根目录为同名临时文件夹；结束后数据库与根目录均验证不存在。见 `sqlite-isolation.log`、`sqlite-isolation-result.json`。其他完整组也保留原有每测试上传目录的上下文清理断言和会话清理断言。

临时 8057 HTTP 服务、密码协调进程已结束；没有留下需客户端依赖的临时测试账号服务。整体结果汇总见 `verification-summary.json`。

## 7. 已知限制与验收边界

1. 微信账号交换/绑定、域名白名单、小程序原生图片显示和 HarmonyOS 页面尚未实测；没有 CodeArts M0 文件可核对。
2. 旧 JWT 没有逐设备撤销与 refresh；logout 仍是客户端行为。媒体票据按当前授权复核，不能替代完整 session 管理。
3. OBS 的认证 open_read 尚未实现；不降级为公开 URL。跨 worker/IP 全局限流需部署层补充，当前是明确的有界本机 admission。
4. 没有排期可用性、价格、押金、支付、交付独立到期或撤销管理界面，不虚构业务字段。
5. JPEG 有预览；PNG/既有 ZIP 只有真实文件下载；未实现 PNG 预览或 ZIP 解包/生成。
6. 保留旧 Web 自有订单的规范化预览权限与旧未分页列表；移动新客户端应只使用已发布目录、分页和媒体票据，不依赖旧列表处理大相册。
7. 选片上限同时受实际 max_select、100 ID 请求限制和旧 Submission CSV 500 字符约束。旧 CSV/JSON 数组格式可读；不擅自重写历史数据。
8. 本轮 Web 回归为组件/路由测试、类型与构建；不将未执行的真实浏览器交互、小程序真机或生产部署验收标为通过。
9. 原有修图版本上传的完整失败补偿并非本阶段新媒体网关功能；本阶段修复其归属与读取脱敏，重点验证最终交付上传补偿。

到 P3-D2 停止。部署迁移、真实微信绑定和客户端适配属于明确后续工作，不能由客户端凭空假设已完成。
