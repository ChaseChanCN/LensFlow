# P3-D2 → CodeArts / HarmonyOS 接入交接

以 [客户 API v1](mobile-customer-api-v1.md) 和 `image-processing-p3-d2/openapi.json` 为实际后端契约。**LIVE_READY 表示代码已在隔离后端验证，不表示用户现有开发数据库已迁移或外部小程序已联调通过。** 部署目标须先审核迁移到 `f7b9d1e3a545`，检查 `/ready`。

## 1. 能力状态

| 能力 | 状态 | 说明 |
|---|---|---|
| 现有客户账号密码注册 / 登录 / me | LIVE_READY | 复用 auth 路由，同一个 User/client 身份 |
| 微信 code 换 LensFlow 会话 / 账号绑定 | REQUIRES_WECHAT_CREDENTIALS | 仅提案；EXTERNAL_CONFIGURATION_REQUIRED，没有可调用的模拟路由 |
| 小程序 token 存储、页面、下载到本地临时文件 | REQUIRES_CLIENT_ADAPTER | CodeArts 独立实现，本仓库未改小程序 |
| 客户意向预约及安全重试 | LIVE_READY | 原 POST bookings + 可选 Idempotency-Key；DATE 非可用时段 |
| 摄影师排期、定价、押金、支付 | BACKEND_GAP / NOT_IN_SCOPE | 当前没有实现，不得在客户端伪装完成 |
| 订单列表 / 详情 | LIVE_READY | 新增白名单投影，分页上限 50 |
| 已发布客户照片目录 / 媒体票据 | LIVE_READY | 真 HTTP JPEG 验证；小程序真机显示仍需适配 |
| 跨设备选片草稿 / CAS / 最终提交 | LIVE_READY | 共用原 SelectionSet/Submission；Web 已发送 revision |
| 最终 JPEG/PNG 下载；既有 ZIP 文件下载 | LIVE_READY | 必须实际 Delivery + DELIVERED/ARCHIVED；原字节流 |
| PNG 成片预览 | BACKEND_GAP | DTO preview_available=false；JPEG 预览已实现 |
| 独立交付过期 / 撤销管理页 | BACKEND_GAP | 没有虚构 expires_at；当前靠资源/发布状态/用户与订单授权复核 |
| 独立设备会话撤销 / refresh | BACKEND_GAP | 沿用现有有限期 JWT；logout 不让旧 JWT 立刻失效 |
| OBS 私有对象 / 分布式全局限流 | NOT_IN_SCOPE | 复用 Storage.open_read 契约；OBS 尚不支持时返回 503 |
| HarmonyOS ArkUI 页面 / 独立 provider 登录 | REQUIRES_CLIENT_ADAPTER | 同一 HTTP/JSON/Bearer/CAS 协议，不建立第二套业务库 |

## 2. 实际可调用端点

下表路径均带 `/api/v1` 前缀。所有客户新接口要求**数据库实际角色 client**，他人订单返回 403。

| 方法 / 路径 | 请求 DTO / 参数 | 响应 DTO | 用途 |
|---|---|---|---|
| POST `/auth/register` | UserRegisterRequest | TokenResponse | 复用；role=client |
| POST `/auth/login` | UserLoginRequest | TokenResponse | 复用；JSON 凭据 |
| GET `/auth/me` | Bearer | UserResponse | 复用身份；不增加 customer/me |
| POST `/bookings` | BookingCreateRequest；可选 Idempotency-Key | BookingResponse，201 | 复用写入口，幂等增强 |
| GET `/customer/bookings` | after、limit | Page[BookingResponse] | 新增本人分页 |
| GET/PATCH `/bookings/{id}` | BookingUpdateRequest（PATCH） | BookingResponse | 复用，补归属与 pending 限制 |
| PATCH `/bookings/{id}/cancel` | 无 | BookingResponse | 复用，本人待确认预约取消 |
| GET `/customer/orders` | after、limit | Page[CustomerOrder] | 新增 SQL 分页 |
| GET `/customer/orders/{id}` | 无 | CustomerOrder | 新增安全详情 |
| GET `/customer/orders/{id}/photos` | after、limit | Page[CustomerPhoto] | 新增已发布照片目录 |
| GET `/customer/orders/{id}/selection` | 无 | SelectionState | 新增权威草稿与规则读取 |
| PUT `/customer/orders/{id}/selection` | SelectionWrite | SelectionState | replace/add/remove + CAS |
| POST `/customer/orders/{id}/selection/submit` | SelectionFinalize | SelectionState | 最终提交，确定性重复返回 |
| GET `/customer/orders/{id}/deliveries` | after、limit | Page[CustomerDelivery] | 实际发布交付文件 |
| POST `/customer/media-grants` | MediaGrantRequest | MediaGrantResponse，201 | 精确资源与变体授权 |
| GET `/customer/media` | Authorization: MediaGrant token，无 query | JPEG / 文件字节流 | 二次授权复核后读取 |
| GET `/deliveries/{id}/download` | Bearer | 文件字节流 | 复用 Web 原下载入口，仍要求发布 |

**不存在已实现的** `/auth/wechat/code`、`/customer/me`、`/customer/bookings` POST、Photo 原图下载、任意 storage_key 下载或自动打包端点。不要照搬任务书中的示例路径当成接口。

## 3. 最短客户接入顺序

1. 账号密码登录，保存 access_token；GET auth/me 核对 role=client。
2. 发起一次预约操作时生成安全随机 Idempotency-Key。发生超时保留原键与原参数重试，不换键重建。
3. GET customer/bookings 读 pending/confirmed/cancelled；摄影师确认后 GET customer/orders。不要由小程序创建 Order 或改状态为已确认。
4. 用 next_after 逐页加载已发布照片，不能对大订单调用旧未分页列表。
5. 对可见照片申请 thumbnail/preview 票据，下载请求用 **MediaGrant 请求头**，再在 image 组件显示客户端临时文件。票据、JWT 不放 URL，不写日志。大小固定，不尝试 `?storage_key=` 或 `?variant=download`。
6. 读取 SelectionState；在本地选择后 PUT 并携带读取到的 revision。成功后替换本地权威 revision。409 时显示当前服务端选择，让用户明确重新加载或合并，再以新 revision 保存；不得盲目重放覆盖。
7. 显式 submit 当前 revision；丢失响应可重复 submit，返回同一最终状态。此后编辑被拒绝。
8. 读取交付列表，仅 download_available=true 时申请 delivery/download 票据。保存完整文件，不从预览截图导出。

### 核心请求

```json
{"expected_revision":2,"operation":"add","selected_photo_ids":[11]}
```

```json
{"kind":"photo","media_id":11,"variant":"thumbnail","size":256}
```

```json
{"kind":"delivery","media_id":9,"variant":"download"}
```

### 错误处理

- 401：账号 JWT 失效则重新登录；媒体票据到期则重新申请，不能把所有 401 当成永久丢失选片。
- 403：停止读取他人资源，不换 order_id 猜测重试。
- 404：尚未发布/已删文件，刷新列表，不用原图 key 回退。
- 409：检查 `code`；SELECTION_CONFLICT 的 `detail.current` 是权威状态。预约键载荷冲突不能换键自动重复下单。
- 413/415/422：用户输入、大小或媒体组合不支持；修正请求。
- 429/503：有限退避，预约沿用原幂等键，选片保留本地内容后重新读版本；不清空用户选择。

## 4. 状态与撤销

预约 preferred_date 只是意向日期；没有实际时段锁定。订单/选片/交付的三个 available 字段及 SelectionState.editable/can_submit 应驱动操作入口，客户端不能推导虚假的已交付状态。

媒体票据 120 秒可复用；每次兑换重新查询活动客户、订单归属、发布和资源身份。新请求在禁用用户/订单取消或换人/撤回发布/删记录后拒绝。已开始的下载不承诺逐块撤销。JWT logout 目前是客户端行为，这一限制与票据当前授权校验不可混淆。

交付时间不等于失效时间。没有新增保存天数或下载次数限制。JPEG/PNG/ZIP 保持已交付原始字节，只有 JPEG 有现阶段规范化预览。

## 5. 外部契约对账

只读检查时 WeChat 仓库没有 `contracts/backend-integration-requests.md` 或 `docs/api-contract-audit.md`。未修改该仓库或 HarmonyOS 仓库。

| 请求来源 | 已支持 | 新增接口 | 未实施 | 契约影响 |
|---|---|---|---|---|
| 尚未提供的 M0 集成请求 | 无法逐条确认 | 以上真实 route 清单 | 不猜测文件内容 | CodeArts 可按此契约提出差异清单 |
| 当前任务书中的 me / bookings 示例 | auth/me、POST bookings 复用 | 仅新增本人分页 GET | 不制造重复写入口 | 适配真实路径 |
| 微信登录链 | 现有 LensFlow JWT | 无 live 微信路由 | code exchange、绑定、真机验证 | 先用真实客户账号进行业务 API 联调 |
| 小程序图片显示 | 真实媒体票据 + HTTP 下载已验证 | media-grants/media | 原生组件直接加载、域名白名单待真机 | downloadFile/临时本地路径方案需客户端实现 |

## 6. 验证证据

见 [阶段报告](image-processing-p3-d2.md) 与同名目录中的 JUnit、HTTP 记录、OpenAPI、数据库清理和数据保护文件。PostgreSQL 是真实本机 14/5433 的新随机测试库；不是 Mock 或 SQLite 冒充。真实 TCP 使用 8057，验证结束即停止，不向客户端提供一个依赖临时测试账户的长期运行后端。
