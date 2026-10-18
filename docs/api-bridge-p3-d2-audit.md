# P3-D2 客户 API 审计

审计基线：`design-system`，存在 C3、D1、C4 未提交工作。D2 前的文件哈希与 Git 状态保存在 `.agentwork/p3-d2/before.json`、`git-before.txt`。实际 Alembic 前置 head 为 `e6a8c0d2f434`。不迁移开发 SQLite，不修改历史迁移。

## 实际能力矩阵（实施前）

| 能力 | 现有路由 | 模型 / 服务 | 实际权限与限制 | 状态 | 必要扩展 |
|---|---|---|---|---|---|
| 账号密码认证 | POST `/api/v1/auth/register`、`login`；GET `auth/me` | User、core/security、deps | client/photographer 普通注册，admin 已禁；JWT 默认 1440 分钟，每请求查询活动用户 | READY | 复用，不另建 customer/me |
| 登出 / 多设备 | POST `auth/logout` | JWT | 客户端丢弃 token；没有服务端会话撤销或 refresh；多设备 token 独立有效 | NEEDS_ADAPTER | 如实交接；禁用用户立即拒绝请求 |
| 微信身份 | 无 | 无 provider binding 模型 | 未见小程序 AppID/Secret 与账号绑定规则；企业微信通知配置不是小程序登录配置 | BLOCKED_BY_EXTERNAL_PLATFORM | 仅提出可信 code 交换与显式绑定契约，不开放模拟端点 |
| 预约创建 / 列表 | POST、GET `/bookings` | Booking | 创建客户限定；列表按身份过滤但不分页；没有重试键 | NEEDS_BACKEND_EXTENSION | 可选持久幂等键，客户分页投影 |
| 预约读 / 改 / 确认 / 取消 | GET/PATCH `/bookings/{id}`、`confirm`、`cancel` | Booking、Order | 读与取消缺归属；确认缺指定摄影师检查和并发保护 | NEEDS_BACKEND_EXTENSION | 共用对象权限，原子 pending 条件更新 |
| 排期 / 费用 / 押金 | 无 | preferred_date 是 DATE；duration_hours 是时长 | 没有排期冲突引擎、价格或支付字段 | NEEDS_ADAPTER | 必须称为意向日期，不能声称可用时段已预订 |
| 订单 | GET `/orders`、`/{id}`、`/{id}/timeline`；PATCH status | Order、OrderTimeline、OrderStateMachine | 列表按身份过滤但无分页；详情、历史、状态写入缺对象归属 | NEEDS_BACKEND_EXTENSION | 旧入口补归属；客户只读白名单 SQL 分页 |
| 摄影师图库 | `/orders/{id}/photos/catalog`、asset、thumbnail | Photo、photo_catalog、photo_access、thumbnails | 现有归属检查、bounded catalog；客户自有订单可读取规范化预览，不限制选片发布 | NEEDS_ADAPTER | 移动客户目录仅投影已发布 SelectionItem；旧预览规则注明兼容性 |
| 照片上传 / 旧列表 | POST/GET `/orders/{id}/photos` | Photo、Storage | 摄影师上传已有归属；旧客户列表泄漏 storage_key | NEEDS_BACKEND_EXTENSION | 客户旧列表删私有 key；桥接目录不返回原图路径 |
| 发布选片 | POST `/orders/{id}/selection-set` | SelectionSet、SelectionItem | SelectionItem 是可选照片集合，不是客户选择；缺摄影师归属检查 | NEEDS_BACKEND_EXTENSION | 保留模型和状态机，补订单锁与权限 |
| 选片读取 / 提交 | `/selection-sets/{id}`、`submit`、`submission` | SelectionSubmission、RetouchTask | 结果为 CSV；提交创建修图任务；缺归属、截止校验、重复 ID、CAS | NEEDS_BACKEND_EXTENSION | 最小伴随草稿表，旧 Web 和桥接共用提交服务 |
| 修图沟通 | `/retouch-tasks/...`、confirm-retouch | RetouchTask/Version/Feedback | 多个路由缺订单归属；内部 key 可见 | NEEDS_BACKEND_EXTENSION | 补旧入口授权，客户去除 key；不当作最终交付 |
| 最终交付 | POST/GET `/orders/{id}/delivery`、GET `/deliveries/{id}/download` | Delivery、Storage | 已有 JPEG/PNG/ZIP 单文件；下载有归属；上传/归档缺归属；未检发布状态 | NEEDS_BACKEND_EXTENSION | 共用发布判定，白名单列表，有限流式下载 |
| 撤销 / 过期 | 无独立撤销表 | Order.status、User.is_active、Delivery 行 | 没有交付到期策略；删除资源、订单归属/取消、禁用用户可作为实时撤销依据 | NEEDS_ADAPTER | 票据兑换重新鉴权，不虚构到期日期 |
| 存储 | Storage.open_read / LocalStorage | services/storage.py | 根路径逃逸已有阻断；OBS 尚未实现 open_read | NEEDS_ADAPTER | 复用二进制接口，OBS 未就绪返回 503，不返回公开 URL |

## 已核对的入口

后端：`app/api/v1/{auth,bookings,orders,photos,photo_catalog,image_edit,selections,retouch,deliveries}.py`；`app/models/{user,booking,order,photo,selection,retouch,delivery}.py`；`app/services/{photo_access,order_state,storage,image_editor,thumbnails}.py`；schemas、配置、schema_readiness、pytest 与 postgres sandbox。

前端：`src/api/{client,auth,bookings,orders,selections,deliveries}.ts`；客户预约、订单、选片、修图反馈、交付页面。Web 仍调用原有业务路由；只需为选片增加服务端草稿恢复及 expected_revision，保持现有布局和交互组件。

## 外部 CodeArts 契约

只读检查 `C:/Users/Chase/Desktop/LensFlow-WeChat`，未找到 `contracts/backend-integration-requests.md` 或 `docs/api-contract-audit.md`。因此没有可逐条核对的 M0 请求，不编造双方一致性。未修改 WeChat/HarmonyOS 仓库。

| 外部请求 | 已支持 | 新端点 | 未实现 | 契约影响 |
|---|---|---|---|---|
| M0 文件未提供 | 按本仓库实际清单审计 | 见最终 handoff | 无法核对缺失文件中的逐项请求 | CodeArts 应以本阶段 handoff 的实际路由接入 |

## 实施决策

1. 复用认证、预约创建、业务发布、修图和交付路由；补客户分页、窄 DTO、媒体授权和 revision 适配器。
2. 只新增预约重试键和选片草稿两个伴随表，保留 Booking/Order/SelectionSubmission 业务权威。
3. 现有自有订单的规范化预览权限保持兼容；移动照片目录和媒体票据严格限制到已发布选片项。原图导出仍只允许摄影师。客户不获得 storage_key 或私有元数据。
4. 无 Redis/Celery/新认证 SDK；不处理微信模拟登录、支付、排期、RAW、OBS 改造。
5. 安全修复属于兼容性边界：其他客户的旧入口读写从无归属变为 403，客户不可借通用状态路由跳过选片校验。
