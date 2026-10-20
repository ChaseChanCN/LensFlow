# LensFlow 客户 API v1（P3-D2）

> 认证更新：普通用户注册/登录已迭代为 +86 短信验证，最新 wire contract 见 [短信认证 API](sms-auth-api-v1.md)。下文 P3-D2 账号密码约定仅作为历史兼容参考，默认已关闭；User.email 允许 null。客户业务 API 与 JWT 用法保持。

权威：现有 FastAPI 业务库、User、Booking、Order、SelectionSet/Item/Submission、RetouchTask、Delivery。所有路径以 `/api/v1` 为前缀。Web、微信小程序与 HarmonyOS 复用相同客户身份和数据。

## 1. 认证：已实施与复用

| 方法 / 路径 | 输入 | 输出 | 权限 |
|---|---|---|---|
| POST `/auth/register` | email、password、name、role（client / photographer）、可选 phone | TokenResponse | 公开；admin 不允许 |
| POST `/auth/login` | email、password | access_token、token_type=bearer、user | 公开；活动账户 |
| GET `/auth/me` | 无 | id、email、name、role、phone、created_at | Bearer JWT |
| POST `/auth/logout` | 无 | message | 现有接口；客户端丢弃 token |

客户接口必须是实际数据库角色 `client`；不会相信请求中的 user_id、client_id 或 JWT 中角色声明。每请求重新读取活动 User。默认 JWT 有效期 1440 分钟，以部署配置为准；没有 refresh、服务端 session 列表或逐设备登出撤销。禁用用户会立即拒绝后续请求和媒体票据兑换。多个设备可独立登录。

```http
Authorization: Bearer <access_token>
```

不得将账户密码、JWT、媒体票据或微信 code 写入日志。生产必须 HTTPS。小程序需要在微信平台配置实际 HTTPS request/download 域名；127.0.0.1 仅用于本机隔离验证。

## 2. 分页、时间、错误

新增列表统一：`?limit=20&after=0`，limit=1..50，after=0..2147483647。SQL 按主键升序、`id > after`、`LIMIT limit+1`；响应 `{items: [...], next_after: number|null}`。next_after 原样作为下一页 after，无总数扫描。插入新行可在后续页出现，删除不会造成 offset 漂移；不承诺跨页数据库快照。

新增订单、选片、交付时间统一 ISO 8601 UTC，后缀 Z。现有 auth/booking/legacy DTO 保留原有无时区 UTC 序列化，适配器按 UTC 解释，不能按手机本地时区直接 parse。`preferred_date` 是 `YYYY-MM-DD` 日历日期，不是 UTC 时刻；没有可确认的具体时段、时区排期引擎或押金逻辑。

业务错误保留 `{code, message, detail}`；409 选片冲突的 detail 为 `{current: SelectionState}`。Schema 错误沿用 FastAPI 422 `{detail:[{loc,msg,type,...}]}`，客户端须兼容这两个已有约定。

| HTTP | 含义 |
|---|---|
| 401 | 缺失/过期 JWT、失效票据、禁用用户 |
| 403 | 身份有效但资源不属于该用户，或角色不允许 |
| 404 | 资源不存在、尚未发布或文件已删除 |
| 409 | 预约状态不允许、幂等键载荷不同、选片版本冲突/已最终提交 |
| 413 | 媒体超过大小上限 |
| 415 | 不支持的媒体类型/变体 |
| 422 | 请求字段、配额、成员资格或媒体 scope 不合法 |
| 429 | 媒体并发/票据速率/活跃预约重试键上限 |
| 503 | 数据库忙、存储不可用；不泄漏 SQL/路径/连接信息 |

API 响应使用 `Cache-Control: private, no-store, max-age=0`、`Vary: Authorization`。媒体另有 nosniff。不存在“HTTP 200 内嵌失败”。

## 3. 预约：复用已有写接口

| 方法 / 路径 | 输入 / 输出 | 鉴权与规则 |
|---|---|---|
| POST `/bookings` | BookingCreateRequest → BookingResponse（201） | client；可选 Idempotency-Key |
| GET `/customer/bookings` | 分页 → Page[BookingResponse] | client，仅自己的预约 |
| GET `/bookings/{id}` | BookingResponse | 本人、指定摄影师；摄影师可查看未指定且 pending 的预约；admin 保留旧管理权限 |
| PATCH `/bookings/{id}` | 部分预约字段 → BookingResponse | 同上，pending；必填字符串不可改为 null |
| PATCH `/bookings/{id}/cancel` | 无 → BookingResponse | 同上，仅 pending |
| PATCH `/bookings/{id}/confirm` | 旧 photographer_id 字段 → BookingResponse | 摄影师；实际摄影师只取已认证用户；原子 pending 更新，最多创建一个 Order |

创建参数：shoot_type 1..50 字符、contact_info 1..500；preferred_date 可空 DATE；note 可空≤2000；location 可空≤200；duration_hours 可空，有限数字 `(0,24]` 小时；photographer_id 可空，必须指向活动摄影师。没有排期可用性承诺。status 由服务端生成 pending / confirmed / cancelled。

```http
POST /api/v1/bookings
Authorization: Bearer <customer JWT>
Idempotency-Key: mini-booking-20261018-001
Content-Type: application/json

{"shoot_type":"portrait","preferred_date":"2026-12-31","contact_info":"13800000000","duration_hours":2}
```

Idempotency-Key：8..128 个 `[A-Za-z0-9_.:-]` 字符。作用域为客户 + 创建预约操作。数据库只保存键 SHA-256、请求规范序列化的 SHA-256、实际 Booking 引用和 UTC 到期时间。24 小时内同键同请求返回同一预约的**当前状态**；同键不同请求 409；丢失响应后可重试。数据库用户行序列化与唯一约束保证并发不会创建两个预约。每客户最多 100 个有效键，每次创建最多清理本客户 100 条过期记录；过期后同键视为新请求。保留键期间不要自动复用不同业务请求。

Web 不传键仍可按旧方式创建：此时不承诺自动重试幂等。客户端应为一次用户操作生成一个键，直至确认结果后再换键。不同客户同键互不影响。

## 4. 订单与已发布照片：新增只读投影

| 方法 / 路径 | 输出 | 鉴权 |
|---|---|---|
| GET `/customer/orders` | Page[CustomerOrder] | client，本人订单 |
| GET `/customer/orders/{order_id}` | CustomerOrder | client，本人订单 |
| GET `/customer/orders/{order_id}/photos` | Page[CustomerPhoto] | client，本人订单，已发布选片集中的 Photo |

CustomerOrder：id、status（现有 OrderStatus）、created_at、updated_at、booking（可空：id/shoot_type/preferred_date/location/duration_hours/status）、selection_available、delivery_available。

状态原样返回：PENDING_CONFIRM、CONFIRMED、WAITING_SHOOT、WAITING_UPLOAD、ANALYZING、WAITING_REVIEW、WAITING_SELECTION、WAITING_RETOUCH、RETOUCHING、WAITING_CLIENT_CONFIRM、WAITING_DELIVERY、DELIVERED、ARCHIVED、CANCELLED。客户端可翻译展示，不得自行推进状态。

selection_available 仅在已发布、未截止、未提交且订单 WAITING_SELECTION 时为 true。delivery_available 仅在存在 Delivery 且订单 DELIVERED/ARCHIVED 时为 true；具体文件可读性仍以交付列表及下载结果为准。

CustomerPhoto：id、order_id、width、height（可空）、selected、thumbnail_available、preview_available。仅 JPEG 有现阶段预览能力；不返回原文件名、storage_key、EXIF/GPS、序列号、摄影师标记、私有描述元数据或编辑参数。selected 读取同一个选片草稿/提交记录。CANCELLED 订单拒绝目录。

```json
{"items":[{"id":1,"order_id":1,"width":517,"height":606,"selected":true,"thumbnail_available":true,"preview_available":true}],"next_after":null}
```

旧 Web 的自有订单规范化 JPEG 预览权限保持已有业务规则，不等于最终原图下载权限。移动端只使用本节已发布目录与下节票据。旧 customer Photo/Delivery/RetouchVersion 响应也移除私有 key。

## 5. 选片：同一领域，新增版本草稿

| 方法 / 路径 | 输入 | 输出 |
|---|---|---|
| GET `/customer/orders/{order_id}/selection` | 无 | SelectionState |
| PUT `/customer/orders/{order_id}/selection` | expected_revision、selected_photo_ids、operation | SelectionState |
| POST `/customer/orders/{order_id}/selection/submit` | expected_revision | SelectionState |

均要求 client 且为真实订单客户。SelectionState：id、order_id、revision、selected_photo_ids、max_select、status=draft/submitted、editable、can_submit、expires_at/published_at。

初始 revision=0，不因 GET 创建记录。PUT operation=replace（默认）/add/remove；replace=[] 即清空草稿。expected_revision 必须为严格整数≥0，ID 为严格正整数；不能传 bool。数组上限 100，不允许重复 ID，所有 ID 必须属于此订单的已发布 SelectionItem。遵守实际 max_select，兼容旧 CSV 字段 500 字符容量。草稿允许空，提交至少一张。

写入必须同时满足发布、未过期、订单 WAITING_SELECTION、尚未最终提交。成功一次 revision+1；未匹配则 409，返回当前权威状态。不能自动覆盖，应保留本地选择让用户显式重新加载/合并。

```http
PUT /api/v1/customer/orders/1/selection
Authorization: Bearer <JWT>
Content-Type: application/json

{"expected_revision":2,"operation":"replace","selected_photo_ids":[11,12]}
```

```json
{"code":"SELECTION_CONFLICT","message":"Selection changed; reload authoritative state","detail":{"current":{"id":4,"order_id":1,"revision":3,"selected_photo_ids":[11],"max_select":3,"status":"draft","editable":true,"can_submit":true,"expires_at":null,"published_at":"2026-10-18T00:00:00Z"}}}
```

提交读取已保存草稿、比较版本，再调用既有 OrderStateMachine：WAITING_SELECTION→WAITING_RETOUCH，同时写入原 SelectionSubmission、OrderTimeline 与所选照片 RetouchTask。不创建 RetouchVersion/Delivery。事务失败不保留部分副作用。已经最终提交时，桥接提交重复调用确定性返回原最终状态（不重建任务），允许丢失响应恢复；PUT 始终 409。

旧 `/selection-sets/{id}` 及 `/orders/{id}/selection-set` 添加 revision、draft_selected_photo_ids、submitted。旧 submit 增加 expected_revision（默认 0 保留首次旧调用）；若移动端已编辑，旧客户端不传版本会 409；最新 Web 已传实际版本。旧重复提交保留 409 语义，桥接重复提交为 200 原状态。

## 6. 私有媒体票据

| 方法 / 路径 | 输入 | 输出 | 鉴权 |
|---|---|---|---|
| POST `/customer/media-grants` | MediaGrantRequest | MediaGrantResponse（201） | client JWT + 当前对象归属/发布校验 |
| GET `/customer/media` | 只接受 MediaGrant 请求头；禁止任意 query | 真实 JPEG 预览或交付原始字节流 | 签名 + 当前活动 User/角色/订单归属/发布/资源身份复核 |

MediaGrantRequest 的合法组合：

| kind | variant | size | 资源 |
|---|---|---|---|
| photo | thumbnail | 128/256/512 | 已发布 SelectionItem 的 JPEG |
| photo | preview | 1024 | 同上，最长边≤1024 |
| delivery | preview | 1024 | 已发布最终 JPEG |
| delivery | download | 不传或 null | 已发布 JPEG/PNG/已有 ZIP 文件，原始字节 |

extra 字段一律 422。没有 photo/download 或任意 storage_key/path/URL 选项。没有开放重定向。

```json
{"kind":"photo","media_id":11,"variant":"thumbnail","size":256}
```

```json
{"token":"<短时票据>","expires_at":"2026-10-18T00:02:00Z","download_path":"/api/v1/customer/media","authorization_scheme":"MediaGrant","reusable":true}
```

票据 HS256 签名，独立 audience=customer-media，120 秒有效，绑定客户、订单、媒体 ID、kind/variant/size 和当前存储身份摘要，不包含存储 key。不能当账号 JWT 登录。TTL 内可重复下载，**不是永久授权**：禁用用户、订单换人/取消、撤回发布、删记录、替换资源身份时下一次兑换即拒绝。已经在传输中的字节不保证中途召回。

每 worker 发票据每客户最多 60 次/分钟，最多保存 4096 个有界 admission 桶；这不是分布式全局限流或幂等机制。每 worker 最多 4 个媒体读取/传输，JPEG 重渲染进一步复用现有单 render_slot；满则 429。最终文件≤100MiB，64KiB 分块。预览复用现有最大源字节/像素约束、无 GPS/EXIF 的规范化 JPEG 与缩略图缓存。冷缓存解码仍受现有有界解码内存限制；缓存命中不重解码全图。

微信/HarmonyOS：先用账号 JWT 发票据，再用支持自定义请求头的下载 API 发送 `Authorization: MediaGrant <token>`，取得沙盒临时文件，图片组件显示本地临时路径。不要把票据拼到 URL；票据快过期时重新授权。Web 可直接使用 Axios Blob。小程序真机下载/域名白名单尚需客户端适配和平台验证；本阶段仅验证实际 HTTP 协议。

download_path 已包含 `/api/v1`，与 API 站点 origin 拼接即可，不再重复追加 API 前缀。客户端临时文件应按自身生命周期清理，退出或切换账户时移除敏感媒体文件。

## 7. 最终交付

GET `/customer/orders/{order_id}/deliveries` → Page[CustomerDelivery]，本人 client。未处于 DELIVERED/ARCHIVED 返回空列表，不把修图预览当成成片。没有虚构到期时间。

CustomerDelivery：id、order_id、filename、delivered_at、media_type、size_bytes、download_available、preview_available。格式/字节数从存储文件头及 seek/stat 获得，不信任扩展名。文件缺失仍返回交付记录但两个 available=false、类型/大小=null；存储依赖故障 503。JPEG 支持安全预览；PNG/已有 ZIP 仅原始文件下载。未增加压缩包生成/解包。

下载用上一节 delivery/download 票据，或 Web 继续现有 `/deliveries/{id}/download`（Bearer、同样重新检查发布）。不静默压缩，完整最终文件字节保持一致。最终文件本身的摄影元数据也保持；摄影师需在发布前决定最终文件是否适合交付，DTO 不返回私有元数据。

## 8. 微信登录：仅提案，未开放路由

**EXTERNAL_CONFIGURATION_REQUIRED / REQUIRES_WECHAT_CREDENTIALS。** 当前没有可用的小程序凭据、真机测试账户或经过确认的绑定规则，不提供生产 mock 登录。

拟议 `POST /auth/wechat/code`：只接受 wx.login() 的临时 code；服务端以 AppID/AppSecret 请求官方 HTTPS code2Session，有限连接/读超时、不跟随任意 URL、不记录 code/secret/session_key、不接受客户端 OpenID。可信 provider+OpenID 只定位一个显式绑定的 LensFlow User；未绑定返回 BINDING_REQUIRED（不创建特权用户，也不按昵称/邮箱猜测合并）。绑定需要现有 LensFlow 账号重新认证 + 新鲜微信 code 的双重证明、一次性挑战和唯一约束，解绑要有可恢复的现有登录方式。此 provider 表/路由/测试 double **均未实施**，不能作为当前客户端依赖。

后续应以微信官方文档确认 code2Session、wx.login、wx.downloadFile 以及生产域名规则。官方参考入口：

- https://developers.weixin.qq.com/miniprogram/dev/server/API/user-login/api_code2session.html
- https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html

本次文档抓取上述官方页面失败，未以第三方内容代替平台验收。真实微信授权和小程序真机媒体展示不能据此标记通过。

## 9. 部署 / 兼容性

新迁移 `f7b9d1e3a545`，前置 `e6a8c0d2f434`；只增加 booking_request_keys 与 customer_selection_drafts，不改原业务表/原图。发布前人工审核并迁移目标部署库；应用启动和本次任务不迁移真实开发库。`/ready` 应在 head 返回 ready。

OBS 尚无认证 open_read 实现，会安全返回 503；不降级为公开 URL。反向代理应配置请求体限制、HTTPS、跨 worker/IP 全局 admission 与敏感请求头日志脱敏。HarmonyOS 使用同样 JWT、JSON、CAS、分页和二进制下载协议，无独立订单/客户数据库。
