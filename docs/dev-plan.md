# LensFlow 开发计划（可执行 Todo 清单）

> 本文档基于《项目构建计划书.md》拆解，供团队直接复制到 GitHub Issues / 项目管理工具使用。
> 每个任务均有唯一 ID、验收标准、测试方式、依赖关系，可独立完成与验证。

---

## 一、项目架构和技术选型建议

### 1.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite 5 | 响应式 SPA，构建快 |
| 前端状态/请求 | Zustand + TanStack Query v5 | 轻量状态 + 服务端数据缓存 |
| 前端 UI | Ant Design 5 + Tailwind CSS | 工作台用 AntD，客户交付页用 Tailwind |
| 前端路由 | React Router v6 | |
| 前端 HTTP | Axios + 拦截器 | 统一鉴权与错误处理 |
| 后端 | Python 3.11 + FastAPI + Uvicorn | 异步、文档自动生成 |
| ORM/迁移 | SQLAlchemy 2.0 + Alembic | |
| 数据校验 | Pydantic v2 | |
| 鉴权 | python-jose (JWT) + passlib[bcrypt] | RBAC：photographer / client / admin |
| 图像分析 | OpenCV + NumPy + Pillow | 可解释指标 |
| 数据库 | PostgreSQL 15（生产）/ SQLite（本地开发 fallback） | 通过适配层切换 |
| 对象存储 | 本地文件系统（开发）+ 华为云 OBS（生产） | 通过 Storage 抽象层 |
| 通知 | 统一 Notifier 接口 + 首期实现 Bark（或企业微信） | 待确认后选定 |
| 测试 | pytest + httpx（后端）/ Vitest（前端）/ Playwright（E2E） | |
| 部署 | Docker + 华为云 CCE/ECS + Nginx | 待确认具体计算服务 |

### 1.2 架构原则

- **单体后端 + 单体前端**，不引入微服务、消息中间件。异步任务用 FastAPI BackgroundTasks 起步，确有压力再引入 Celery/Redis（P2）。
- **存储抽象层**：`Storage` 接口隔离本地 FS 与 OBS，避免云不可用时本地无法启动。
- **通知抽象层**：`Notifier` 接口隔离具体渠道。
- **订单状态机集中实现**：所有状态流转走 `OrderStateMachine`，禁止业务代码直接改 status 字段。

---

## 二、MVP 功能边界

### 必须完成（P0）

1. 用户注册/登录（摄影师、客户两种角色）
2. 客户提交预约、摄影师确认/拒绝
3. 订单创建 + 状态机流转（14 个状态）
4. 图片上传（仅 JPEG，单张 ≤ 20MB）
5. OpenCV 初筛：清晰度（拉普拉斯方差）、亮度均值、高光占比、阴影占比
6. 摄影师人工复核（可修改判定，不删原片）
7. 摄影师发布选片集 → 客户选片 → 提交
8. 修图任务创建 + 状态管理 + 预览图上传 + 客户反馈
9. 最终成片上传 + 客户下载
10. 一种通知渠道真实可用 + 发送记录 + 失败重试
11. 数据库持久化 + Alembic 迁移
12. 部署到华为云，可公网访问
13. 端到端测试（至少 1 条完整订单闭环）

### 明确不做（P1/P2 后续）

- RAW 文件分析（P2）
- 相似照片自动分组（P1）
- Redis 缓存 / Celery 异步队列（P2）
- 多版本修图预览对比（P1）
- 复杂图像质量模型 / ML 模型（P2）
- 多工作室、多摄影师团队协作（P2）
- 专业自动修图 / 高级色彩处理（P2）
- 阈值自动校准（P1）

---

## 三、关键技术风险及验证顺序

| 序号 | 风险 | 验证方式 | 验证阶段 |
|---|---|---|---|
| R1 | 华为云 OBS/RDS/计算服务权限或计费未知 | 登录控制台查询可用服务、配额、区域 | 阶段一 |
| R2 | CodeArts 实际能力与预期不符 | 用 CodeArts 完成一次小型代码生成+检查 | 阶段一 |
| R3 | 通知渠道 API 不可用或凭据缺失 | 发送一条测试消息 | 阶段一 |
| R4 | OpenCV 指标对创作类照片误判 | 用测试集（虚焦/过曝/欠曝/正常/浅景深）跑分析 | 阶段四 |
| R5 | 大图上传超时或内存溢出 | 20MB 图片上传压测 | 阶段四 |
| R6 | 前后端跨域 / 生产静态资源路径 | 本地联调 + 部署后验证 | 阶段二/七 |
| R7 | 状态机非法跳转导致数据不一致 | 单元测试覆盖所有非法转换 | 阶段三 |
| R8 | 通知失败影响订单状态 | 通知与状态解耦的单测 | 阶段六 |

---

## 四、建议的仓库目录结构

```
lensflow/
├── README.md
├── .env.example
├── docs/
│   ├── architecture.md
│   ├── api-spec.md
│   ├── state-machine.md
│   └── deploy-guide.md
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py          # Settings (pydantic-settings)
│   │   │   ├── security.py        # JWT、密码哈希
│   │   │   ├── database.py        # 引擎/会话
│   │   │   ├── logging.py
│   │   │   └── exceptions.py
│   │   ├── models/                # SQLAlchemy ORM
│   │   ├── schemas/               # Pydantic DTO
│   │   ├── api/v1/
│   │   │   ├── auth.py
│   │   │   ├── bookings.py
│   │   │   ├── orders.py
│   │   │   ├── photos.py
│   │   │   ├── analysis.py
│   │   │   ├── selections.py
│   │   │   ├── retouch.py
│   │   │   ├── delivery.py
│   │   │   ├── notifications.py
│   │   │   └── todos.py
│   │   ├── services/
│   │   │   ├── order_state.py     # 状态机
│   │   │   ├── image_analyzer.py  # OpenCV
│   │   │   ├── storage.py         # 存储抽象
│   │   │   ├── notifier.py        # 通知抽象
│   │   │   └── todo_generator.py
│   │   └── deps.py                # 依赖注入
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_state_machine.py
│   │   ├── test_orders.py
│   │   ├── test_analyzer.py
│   │   └── test_notifications.py
│   └── storage_local/             # 本地开发文件
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                   # axios 客户端 + endpoints
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── photographer/      # 工作台
│   │   │   └── client/            # 客户交付页
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   └── tests/
└── deploy/
    ├── docker-compose.yml
    ├── Dockerfile.backend
    ├── Dockerfile.frontend
    └── huawei/
        └── README.md
```

---

## 五、核心数据库实体和关系

```
User (id, role[photographer/client/admin], email, password_hash, name, phone, created_at)
  │
  ├─1:1─ Booking (id, client_id→User, photographer_id→User, shoot_type,
  │              preferred_date, contact_info, note, status, created_at)
  │
  └─1:N─ Order (id, booking_id→Booking, client_id→User, photographer_id→User,
                status, created_at, updated_at, archived_at)
            │
            ├─1:N─ Photo (id, order_id, filename, storage_key, mime,
            │             size_bytes, width, height, uploaded_at)
            │         │
            │         └─1:1─ AnalysisResult (id, photo_id, sharpness_score,
            │                                brightness_mean, highlight_ratio,
            │                                shadow_ratio, suggestion, risk_level,
            │                                reviewed, reviewer_id, reviewed_at,
            │                                final_decision)
            │
            ├─1:1─ SelectionSet (id, order_id, expires_at, max_select,
            │                    created_at, published_at)
            │         │
            │         ├─1:N─ SelectionItem (id, selection_set_id, photo_id)
            │         │
            │         └─1:1─ SelectionSubmission (id, selection_set_id,
            │                                  submitted_at, selected_photo_ids[])
            │
            ├─1:N─ RetouchTask (id, order_id, photo_id, status, due_date)
            │         │
            │         ├─1:N─ RetouchVersion (id, retouch_task_id, storage_key,
            │         │                      version_no, uploaded_at)
            │         │
            │         └─1:N─ RetouchFeedback (id, retouch_task_id, version_id,
            │                                 content, author_id, created_at)
            │
            ├─1:1─ Delivery (id, order_id, storage_key, delivered_at)
            │
            └─1:N─ OrderTimeline (id, order_id, from_status, to_status,
                                   actor_id, action, created_at)

NotificationLog (id, channel, target, template, payload, status,
                 sent_at, error_message, retry_count, related_order_id)

TodoItem (id, assignee_id→User, order_id→Order, type, title, due_date, done, created_at)

AuditLog (id, user_id, action, entity_type, entity_id, payload, created_at)
```

---

## 六、订单状态机及合法状态转换

**状态枚举**（14 个）：

```
PENDING_CONFIRM          待确认预约
CONFIRMED                已确认预约
WAITING_SHOOT            待拍摄
WAITING_UPLOAD           待上传照片
ANALYZING                AI 初筛处理中
WAITING_REVIEW           待摄影师复核
WAITING_SELECTION        待客户选片
WAITING_RETOUCH          待修图
RETOUCHING               修图处理中
WAITING_CLIENT_CONFIRM   待客户确认
WAITING_DELIVERY         待最终交付
DELIVERED                已交付
ARCHIVED                 已归档
CANCELLED                已取消（终态）
```

**合法转换**：

| 当前状态 | 允许目标状态 | 触发角色 | 触发动作 |
|---|---|---|---|
| PENDING_CONFIRM | CONFIRMED | photographer | 确认预约 |
| PENDING_CONFIRM | CANCELLED | photographer/client | 拒绝/取消 |
| CONFIRMED | WAITING_SHOOT | system/photographer | 自动或手动 |
| CONFIRMED | CANCELLED | photographer/client | 取消 |
| WAITING_SHOOT | WAITING_UPLOAD | photographer | 标记完成拍摄 |
| WAITING_SHOOT | CANCELLED | photographer | 取消 |
| WAITING_UPLOAD | ANALYZING | system | 首张照片上传完成触发 |
| ANALYZING | WAITING_REVIEW | system | 全部分析完成 |
| ANALYZING | WAITING_REVIEW | photographer | 分析失败，强制进入复核 |
| WAITING_REVIEW | WAITING_SELECTION | photographer | 发布选片集 |
| WAITING_SELECTION | WAITING_RETOUCH | client | 提交选片 |
| WAITING_RETOUCH | RETOUCHING | photographer | 开始修图 |
| RETOUCHING | WAITING_CLIENT_CONFIRM | photographer | 上传预览 |
| WAITING_CLIENT_CONFIRM | RETOUCHING | client | 要求修改 |
| WAITING_CLIENT_CONFIRM | WAITING_DELIVERY | client | 确认 |
| WAITING_DELIVERY | DELIVERED | photographer | 上传最终成片 |
| DELIVERED | ARCHIVED | system/photographer | 归档 |

**规则**：
- 任何不在表中的转换抛 `InvalidStateTransition`，返回 409。
- CANCELLED、ARCHIVED 为终态，不可转出。
- 每次转换写入 `OrderTimeline`，记录 actor、action、时间戳。

---

## 七、前后端 API 模块清单

### 认证 `/api/v1/auth`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /register | 注册（指定 role） |
| POST | /login | 登录，返回 JWT |
| POST | /logout | 登出 |
| GET | /me | 当前用户信息 |

### 预约 `/api/v1/bookings`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | / | 客户提交预约 |
| GET | / | 列表（按角色过滤） |
| GET | /{id} | 详情 |
| PATCH | /{id}/confirm | 摄影师确认 |
| PATCH | /{id}/cancel | 取消 |

### 订单 `/api/v1/orders`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 列表 |
| GET | /{id} | 详情 |
| PATCH | /{id}/status | 状态流转 |
| GET | /{id}/timeline | 操作记录 |

### 图片 `/api/v1/orders/{id}/photos`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | / | 上传（multipart） |
| GET | / | 列表 |
| DELETE | /{photo_id} | 删除（仅未发布选片时） |

### 分析 `/api/v1`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /photos/{id}/analyze | 触发分析 |
| GET | /photos/{id}/analysis | 获取结果 |
| PATCH | /analysis/{id}/review | 人工复核 |

### 选片 `/api/v1`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /orders/{id}/selection-set | 发布选片集 |
| GET | /selection-sets/{id} | 客户查看 |
| POST | /selection-sets/{id}/submit | 客户提交 |
| GET | /selection-sets/{id}/submission | 提交结果 |

### 修图 `/api/v1`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /orders/{id}/retouch-tasks | 任务列表 |
| POST | /retouch-tasks/{id}/versions | 上传预览 |
| POST | /retouch-tasks/{id}/feedback | 客户反馈 |
| PATCH | /retouch-tasks/{id}/status | 更新状态 |

### 交付 `/api/v1`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /orders/{id}/delivery | 上传最终成片 |
| GET | /orders/{id}/delivery | 交付信息 |
| GET | /delivery/{id}/download | 下载（鉴权） |

### 通知 `/api/v1/notifications`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 发送记录 |
| POST | /test | 发送测试消息 |

### 待办 `/api/v1/todos`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 列表 |
| PATCH | /{id} | 标记完成 |

---

## 八、华为云服务、CodeArts 和通知渠道的待确认事项

| 编号 | 待确认事项 | 影响的任务 | 验证方式 |
|---|---|---|---|
| Q1 | 华为云账号可用区域 | 部署、OBS、RDS | 控制台查询 |
| Q2 | RDS for PostgreSQL 是否可用及规格/计费 | 数据库选型 | 控制台 + 文档 |
| Q3 | OBS 桶权限、计费、区域 | 图片存储 | 创建测试桶 |
| Q4 | 计算服务用 CCE / ECS / FunctionGraph | 部署方案 | 控制台查询 |
| Q5 | 域名与 HTTPS 证书来源 | 生产访问 | 确认是否有可用域名 |
| Q6 | CodeArts 流水线、代码检查、部署能力 | CI/CD | 实际创建一条流水线 |
| Q7 | 通知渠道选定：企业微信 vs Bark | 通知模块 | 发送测试消息 |
| Q8 | 通知渠道 API 凭据（key/token） | 通知模块 | 获取凭据 |
| Q9 | 单次上传图片大小/数量限制 | 上传接口 | 确认 OBS 单对象限制 |
| Q10 | 客户选片集访问是否需要登录 | 选片页面 | 产品决策 |
| Q11 | CodeArts Agent/Skills 实际可用范围 | 开发流程 | 小型验证 |

---

## 九、建议的端到端演示流程

```
1. 客户在交付页提交预约（拍摄类型、日期、联系方式）
2. 摄影师工作台确认预约 → 订单创建
3. 摄影师标记完成拍摄
4. 摄影师上传 5 张测试照片（含虚焦、过曝、欠曝、正常、浅景深）
5. 系统自动分析，展示 4 项指标 + 风险提示
6. 摄影师复核，将 1 张"建议排除"改为"正常"（人工修正）
7. 摄影师发布选片集（选 4 张展示，最多选 3 张）
8. 客户收到通知，进入选片页，选择 3 张，提交
9. 系统创建 3 个修图任务，摄影师收到待办
10. 摄影师上传第 1 版预览图
11. 客户查看预览，对 1 张提出修改意见
12. 摄影师上传第 2 版预览，客户确认
13. 摄影师上传最终成片
14. 客户下载成片
15. 订单归档，全程通知记录可查
```

---

## 十、开发阶段总览

| 阶段 | 名称 | P0 任务数 | 关键交付物 | 可并行点 |
|---|---|---|---|---|
| S1 | 技术验证与项目骨架 | 8 | 风险消除 + 仓库初始化 | 前端/后端骨架并行 |
| S2 | 认证与基础设施 | 6 | 登录可用 + DB 迁移 | 前端登录 / 后端鉴权 |
| S3 | 预约与订单工作流 | 7 | 状态机 + 订单 CRUD | 前端页面 / 后端接口 |
| S4 | 图片上传与 AI 初筛 | 8 | 上传 + OpenCV 分析 + 复核 | 分析服务 / 上传接口 |
| S5 | 客户选片与修图协作 | 7 | 选片集 + 修图任务 | 选片 / 修图模块 |
| S6 | 通知与最终交付 | 6 | 通知渠道 + 交付下载 | 通知 / 交付 |
| S7 | 华为云部署与演示 | 7 | 可公网访问的演示环境 | 部署 / 演示数据 |
| S8 | 测试与材料整理 | 5 | 测试报告 + 竞赛材料 | 测试 / 文档 |

---

## 十一、阶段一详细任务（S1：技术验证与项目骨架）

### S1-T01：华为云资源可用性验证
- **优先级**：P0
- **前置依赖**：无
- **执行内容**：登录华为云控制台，查询当前账号可用区域、RDS（PostgreSQL）是否可用及规格、OBS 是否可用及计费标准、CCE/ECS/FunctionGraph 可用情况、是否有可用域名。
- **涉及模块**：部署配置
- **预期产出**：`docs/deploy-guide.md` 中记录可用服务清单、区域、规格、计费摘要；更新"待确认事项"状态。
- **验收标准**：文档中明确列出：可用区域、RDS 是否可用、OBS 是否可用、计算服务选型结论、域名结论。每项标注"已验证"或"不可用-需替代方案"。
- **测试方式**：人工核对控制台与文档一致。
- **风险**：服务不可用 → 回退到本地 Docker + 本地 PostgreSQL 部署。
- **云资源/外部依赖**：华为云控制台。

### S1-T02：CodeArts 能力验证
- **优先级**：P0
- **前置依赖**：无
- **执行内容**：用 CodeArts 完成一次小型任务（如生成一个 FastAPI hello world + 代码检查），记录可用功能：代码生成、检查、流水线、部署。
- **预期产出**：`docs/codearts-usage.md` 记录可用能力与限制。
- **验收标准**：文档列出至少 3 项已验证的 CodeArts 能力，并记录一次实际使用截图/日志。
- **测试方式**：人工核对记录。
- **风险**：能力不符 → 保留本地开发路径，CodeArts 作为辅助。

### S1-T03：通知渠道验证
- **优先级**：P0
- **前置依赖**：无
- **执行内容**：在 Bark 和企业微信中选定一种（或两种都测试），获取 API 凭据，发送一条测试消息，记录请求/响应。
- **预期产出**：`docs/notification-setup.md` 记录选定渠道、API 文档链接、凭据存放位置（环境变量名）、测试发送结果。
- **验收标准**：至少一条消息成功送达，有 HTTP 响应记录。
- **测试方式**：实际收到推送消息。
- **风险**：渠道不可用 → 尝试另一种；都不可用 → 首期用站内待办 + 邮件兜底。
- **外部依赖**：通知渠道 API。

### S1-T04：后端项目骨架
- **优先级**：P0
- **前置依赖**：S1-T01（确认 DB 选型）
- **执行内容**：创建 `backend/` 目录，初始化 FastAPI 项目：`pyproject.toml`、`app/main.py`、`core/config.py`（pydantic-settings 读环境变量）、`core/database.py`（SQLAlchemy 引擎，支持 SQLite/PostgreSQL 切换）、`core/logging.py`、`core/exceptions.py`（统一异常处理）、健康检查端点 `GET /health`。配置 `.env.example`。
- **涉及文件**：`backend/pyproject.toml`、`backend/app/main.py`、`backend/app/core/*`、`backend/.env.example`
- **预期产出**：`uvicorn app.main:app` 可启动，`GET /health` 返回 `{"status":"ok"}`。
- **验收标准**：本地启动无报错；健康检查返回 200；Swagger UI `/docs` 可访问。
- **测试方式**：`pytest tests/test_health.py`（1 个测试用例）+ 手动访问 `/docs`。
- **风险**：依赖安装失败 → 锁定版本。

### S1-T05：前端项目骨架
- **优先级**：P0
- **前置依赖**：无
- **执行内容**：创建 `frontend/`，初始化 Vite + React + TS。配置 AntD、Tailwind、React Router、Zustand、TanStack Query、Axios。创建 `api/client.ts`（axios 实例 + 拦截器）、`App.tsx` 路由骨架、`pages/` 空页面占位。配置 `.env.example`（`VITE_API_BASE_URL`）。
- **涉及文件**：`frontend/package.json`、`frontend/src/main.tsx`、`frontend/src/App.tsx`、`frontend/src/api/client.ts`、`frontend/.env.example`
- **预期产出**：`npm run dev` 启动，首页显示占位内容，API 请求指向后端。
- **验收标准**：`npm run dev` 无报错；`npm run build` 成功；TypeScript 编译无错误。
- **测试方式**：`npm run build` + `tsc --noEmit`。
- **风险**：版本冲突 → 锁定 package-lock。

### S1-T06：数据库模型与初始迁移
- **优先级**：P0
- **前置依赖**：S1-T04
- **执行内容**：实现全部 ORM 模型（User、Booking、Order、Photo、AnalysisResult、SelectionSet、SelectionItem、SelectionSubmission、RetouchTask、RetouchVersion、RetouchFeedback、Delivery、OrderTimeline、NotificationLog、TodoItem、AuditLog）。配置 Alembic，生成初始迁移。
- **涉及文件**：`backend/app/models/*.py`、`backend/alembic/`
- **预期产出**：`alembic upgrade head` 创建所有表。
- **验收标准**：迁移成功；表结构与模型一致；`alembic downgrade base` 可回滚。
- **测试方式**：`alembic upgrade head && alembic downgrade base` 无报错。
- **风险**：外键约束顺序 → 迁移中按依赖顺序建表。

### S1-T07：订单状态机实现
- **优先级**：P0
- **前置依赖**：S1-T06
- **执行内容**：实现 `services/order_state.py`：`OrderStateMachine` 类，包含状态枚举、合法转换表、`transition(order, target, actor, action)` 方法。非法转换抛 `InvalidStateTransition`。每次转换写 `OrderTimeline`。
- **涉及文件**：`backend/app/services/order_state.py`、`backend/app/core/exceptions.py`
- **预期产出**：状态机可独立调用，非法转换抛异常。
- **验收标准**：单元测试覆盖全部 17 条合法转换 + 至少 5 条非法转换。
- **测试方式**：`pytest tests/test_state_machine.py`（≥22 个用例全绿）。
- **风险**：遗漏边界 → 用表驱动测试。

### S1-T08：项目文档与启动说明
- **优先级**：P0
- **前置依赖**：S1-T04、S1-T05
- **执行内容**：编写 `README.md`（启动步骤）、`docs/architecture.md`（架构图）、`docs/state-machine.md`（状态机表）、`docs/api-spec.md`（API 清单）。
- **预期产出**：文档可指导新人启动项目。
- **验收标准**：按 README 步骤可在干净环境启动前后端。
- **测试方式**：人工按步骤操作。

> **S1 并行/串行**：T01/T02/T03 可并行；T04 完成后 T06→T07 串行；T05 与 T04 并行；T08 在 T04/T05 后。

---

## 十二、阶段二详细任务（S2：认证与基础设施）

### S2-T01：后端认证服务
- **优先级**：P0
- **前置依赖**：S1-T04、S1-T06
- **执行内容**：实现 `core/security.py`：密码哈希（bcrypt）、JWT 签发/验证。实现 `api/v1/auth.py`：register、login、logout、me。实现 RBAC 依赖注入 `deps.py`：`get_current_user`、`require_role("photographer")`、`require_role("client")`。
- **涉及文件**：`backend/app/core/security.py`、`backend/app/api/v1/auth.py`、`backend/app/deps.py`、`backend/app/schemas/auth.py`
- **预期产出**：注册/登录返回 JWT，受保护端点拒绝无 token 请求。
- **验收标准**：注册 → 登录 → 携带 token 访问 /me 返回用户信息；无 token 访问 /me 返回 401；错误角色访问返回 403。
- **测试方式**：`pytest tests/test_auth.py`（≥6 用例）。
- **风险**：JWT 密钥泄露 → 从环境变量读取。

### S2-T02：前端登录与路由守卫
- **优先级**：P0
- **前置依赖**：S1-T05、S2-T01
- **执行内容**：实现登录页、注册页。Axios 拦截器自动携带 token、401 跳转登录。路由守卫：未登录跳转 /login，角色相符才可访问对应路由。Zustand store 存储用户信息。
- **涉及文件**：`frontend/src/pages/auth/`、`frontend/src/api/auth.ts`、`frontend/src/stores/auth.ts`、`frontend/src/App.tsx`
- **预期产出**：前端可完成注册/登录，工作台需登录才可访问。
- **验收标准**：注册并登录后跳转工作台；刷新页面保持登录态；登出后跳转登录页。
- **测试方式**：Vitest + 手动验证。
- **风险**：token 过期处理 → 401 拦截 + 跳转登录。

### S2-T03：统一错误处理与 API 封装
- **优先级**：P0
- **前置依赖**：S1-T04、S1-T05
- **执行内容**：后端统一异常处理中间件（业务异常 → HTTP 错误码 + JSON body）。前端 Axios 响应拦截器统一解析错误、Toast 提示。定义错误码枚举。
- **涉及文件**：`backend/app/core/exceptions.py`、`backend/app/main.py`、`frontend/src/api/client.ts`
- **预期产出**：所有错误返回统一格式 `{code, message, detail}`。
- **验收标准**：触发 400/401/403/404/409/500 均返回统一格式；前端正确展示。
- **测试方式**：`pytest` + 前端手动触发。

### S2-T04：存储抽象层
- **优先级**：P0
- **前置依赖**：S1-T04
- **执行内容**：实现 `services/storage.py`：`Storage` 抽象基类（save、get_url、delete、exists）。实现 `LocalStorage`（写本地目录）和 `OBSStorage`（华为云 OBS，依赖待 S1-T01 确认后实现）。通过配置切换。
- **涉及文件**：`backend/app/services/storage.py`
- **预期产出**：业务代码通过 `Storage` 接口操作文件，不直接依赖具体存储。
- **验收标准**：本地存储可上传/下载/删除文件；接口一致。
- **测试方式**：`pytest tests/test_storage.py`。
- **风险**：OBS SDK 不可用 → 先只实现 LocalStorage，OBS 在 S7 补全。

### S2-T05：通知抽象层与发送记录
- **优先级**：P0
- **前置依赖**：S1-T03、S1-T06
- **执行内容**：实现 `services/notifier.py`：`Notifier` 抽象基类（send）、`BarkNotifier`（或企业微信）。每次发送写 `NotificationLog`（含 status、error、retry_count）。实现失败重试（最多 3 次，指数退避）。通知与订单状态解耦：通知失败不影响状态流转。
- **涉及文件**：`backend/app/services/notifier.py`、`backend/app/models/notification.py`
- **预期产出**：可发送通知并记录结果；失败自动重试；有发送记录查询接口。
- **验收标准**：发送成功 → log status=sent；发送失败 → 重试 3 次后 status=failed，记录 error；通知失败不改变订单状态。
- **测试方式**：`pytest tests/test_notifications.py`（mock 渠道 + 真实渠道各一组）。
- **风险**：渠道 API 限流 → 重试退避。

### S2-T06：基础 CI 与代码规范
- **优先级**：P1
- **前置依赖**：S1-T04、S1-T05
- **执行内容**：后端配置 ruff + black + mypy。前端配置 ESLint + Prettier。添加 pre-commit hooks。GitHub Actions（或 CodeArts 流水线）跑 lint + test。
- **涉及文件**：`backend/pyproject.toml`、`frontend/.eslintrc`、`.pre-commit-config.yaml`
- **预期产出**：`make lint` 和 `make test` 一键执行。
- **验收标准**：lint 无错误；CI 在 PR 上自动运行。
- **测试方式**：`make lint && make test` 全绿。

> **S2 并行/串行**：T01→T02 串行；T03/T04/T05 可与 T01 并行；T06 最后。

---

## 十三、阶段三任务框架（S3：预约与订单工作流）

| 任务 ID | 名称 | 优先级 | 依赖 | 验收标准 |
|---|---|---|---|---|
| S3-T01 | 预约提交与确认 API | P0 | S2-T01 | 客户可提交预约，摄影师可确认/取消，状态正确 |
| S3-T02 | 订单创建与查询 API | P0 | S3-T01、S1-T07 | 确认预约自动创建订单，可列表/详情查询 |
| S3-T03 | 订单状态流转 API | P0 | S1-T07、S3-T02 | PATCH /orders/{id}/status 走状态机，非法转换返回 409 |
| S3-T04 | 操作记录（Timeline） | P0 | S3-T03 | 每次状态变更写入 OrderTimeline，可查询 |
| S3-T05 | 待办事项自动生成 | P0 | S3-T03 | 关键状态变更生成 TodoItem（如待上传、待复核） |
| S3-T06 | 前端预约与订单页面 | P0 | S3-T01~T03、S2-T02 | 客户可提交预约，摄影师工作台可确认/查看订单 |
| S3-T07 | 权限隔离测试 | P0 | S3-T01~T03 | 客户无法访问摄影师接口，反之亦然；越权返回 403 |

> **S3 交付物**：无需 AI，可完成预约→确认→订单创建→状态更新全流程。阶段验收：`pytest tests/test_orders.py` 全绿 + 前端可操作完整预约流程。

---

## 十四、阶段四任务框架（S4：图片上传与 AI 初筛）

| 任务 ID | 名称 | 优先级 | 依赖 | 验收标准 |
|---|---|---|---|---|
| S4-T01 | 图片上传接口 | P0 | S2-T04、S3-T03 | 支持 JPEG multipart 上传，校验类型/大小，写 Photo 记录，存到 Storage |
| S4-T02 | 图片列表与删除 | P0 | S4-T01 | 可按订单查图片，未发布选片时可删除 |
| S4-T03 | OpenCV 分析核心 | P0 | S4-T01 | 计算 sharpness（拉普拉斯方差）、brightness_mean、highlight_ratio、shadow_ratio，写 AnalysisResult |
| S4-T04 | 异常判定规则 | P0 | S4-T03 | 基于阈值生成 suggestion（建议排除/需复核/暂未发现问题）+ risk_level，阈值可配置 |
| S4-T05 | 分析任务调度 | P0 | S4-T03 | 上传后触发分析（FastAPI BackgroundTasks），订单状态 → ANALYZING → WAITING_REVIEW |
| S4-T06 | 摄影师复核接口 | P0 | S4-T03 | PATCH /analysis/{id}/review 可修改 final_decision，记录 reviewer，不删原片 |
| S4-T07 | 前端上传与分析结果页 | P0 | S4-T01、S4-T03、S4-T06 | 拖拽上传、进度条、指标展示、风险标签、复核操作 |
| S4-T08 | 分析测试集验证 | P0 | S4-T03、S4-T04 | 用 5 张测试图（虚焦/过曝/欠曝/正常/浅景深）验证指标合理，浅景深不误判为废片 |

> **S4 交付物**：上传 JPEG → 自动分析 → 展示指标与风险 → 摄影师复核。阶段验收：测试集分析结果合理 + 复核流程可用。

---

## 十五、阶段五任务框架（S5：客户选片与修图协作）

| 任务 ID | 名称 | 优先级 | 依赖 | 验收标准 |
|---|---|---|---|---|
| S5-T01 | 选片集发布 | P0 | S4-T06 | 摄影师选择照片创建 SelectionSet，设 max_select、expires_at，订单→WAITING_SELECTION |
| S5-T02 | 客户选片页面 | P0 | S5-T01 | 客户可浏览、选择/取消，显示剩余可选数，超过限制禁止 |
| S5-T03 | 选片提交（防重复） | P0 | S5-T01 | 提交写 SelectionSubmission，重复提交返回 409，订单→WAITING_RETOUCH |
| S5-T04 | 修图任务生成 | P0 | S5-T03 | 选片结果自动生成 RetouchTask（每张一个） |
| S5-T05 | 预览图上传与版本 | P0 | S5-T04 | 摄影师上传 RetouchVersion，客户可查看，记录 version_no |
| S5-T06 | 客户反馈与确认 | P0 | S5-T05 | 客户可提交 RetouchFeedback 或确认；确认→WAITING_DELIVERY，修改→RETOUCHING |
| S5-T07 | 前端修图协作页 | P0 | S5-T04~T06 | 摄影师看任务列表，客户看预览+反馈 |

> **S5 交付物**：选片集发布→客户选片→修图任务→预览→反馈→确认全流程可操作。

---

## 十六、阶段六任务框架（S6：通知与最终交付）

| 任务 ID | 名称 | 优先级 | 依赖 | 验收标准 |
|---|---|---|---|---|
| S6-T01 | 通知规则配置 | P0 | S2-T05 | 预约确认/拍摄前/选片/修图反馈/交付完成 5 个节点触发通知 |
| S6-T02 | 通知与状态解耦验证 | P0 | S6-T01、S2-T05 | 通知失败时订单状态仍正确流转（单测） |
| S6-T03 | 最终成片上传 | P0 | S5-T06 | POST /orders/{id}/delivery 上传成片，订单→DELIVERED |
| S6-T04 | 客户下载 | P0 | S6-T03 | GET /delivery/{id}/download 鉴权后返回文件，非授权用户 403 |
| S6-T05 | 订单归档 | P0 | S6-T03 | 订单→ARCHIVED，归档后只读 |
| S6-T06 | 前端交付页 | P0 | S6-T03、S6-T04 | 客户可查看/下载成片，摄影师可触发归档 |

> **S6 交付物**：通知在 5 个节点触发 + 最终成片上传下载 + 归档。完整订单可从预约到归档。

---

## 十七、阶段七任务框架（S7：华为云部署与竞赛演示）

| 任务 ID | 名称 | 优先级 | 依赖 | 验收标准 |
|---|---|---|---|---|
| S7-T01 | OBS 存储实现 | P0 | S1-T01、S2-T04 | OBSStorage 实现并通过接口测试 |
| S7-T02 | 生产数据库配置 | P0 | S1-T01 | RDS PostgreSQL 连通，Alembic 迁移成功 |
| S7-T03 | Docker 镜像与部署 | P0 | S7-T01、S7-T02 | 前后端 Docker 镜像构建成功，部署到华为云计算服务 |
| S7-T04 | Nginx + HTTPS | P0 | S7-T03 | 前端静态资源由 Nginx 托管，API 反代后端，HTTPS 可用 |
| S7-T05 | 生产环境联调 | P0 | S7-T04 | 完整端到端流程在公网环境跑通 |
| S7-T06 | 演示数据与账号 | P0 | S7-T05 | 准备演示账号 + 测试图片 + 演示脚本 |
| S7-T07 | 部署问题排查记录 | P0 | S7-T05 | 记录跨域/权限/超时等问题及修复过程 |

> **S7 交付物**：公网可访问的演示环境，完整业务流程可重复运行。

---

## 十八、阶段八任务框架（S8：测试与材料整理）

| 任务 ID | 名称 | 优先级 | 依赖 | 验收标准 |
|---|---|---|---|---|
| S8-T01 | 核心业务功能测试 | P0 | S3~S6 | pytest 覆盖订单闭环、选片、修图、交付，通过率 100% |
| S8-T02 | E2E 测试（Playwright） | P0 | S7-T05 | 至少 1 条完整订单闭环 E2E 测试通过 |
| S8-T03 | AI 初筛准确性统计 | P1 | S4-T08 | 用标注测试集统计 Precision/Recall/F1，记录实际值 |
| S8-T04 | 竞赛材料整理 | P0 | S7-T05 | 架构图、华为云使用说明、CodeArts 使用记录、演示脚本 |
| S8-T05 | 性能与权限测试 | P1 | S7-T05 | 上传压测、权限越权测试、通知失败测试，记录结果 |

---

## 十九、P0 任务依赖关系图

```
S1-T01 (云验证) ─┬─→ S1-T04 ──→ S1-T06 ──→ S1-T07 ──→ S2-T01 ──→ S3-T01 ──→ S3-T02 ──→ S3-T03 ──→ S4-T01 ──→ S4-T03 ──→ S4-T05 ──→ S5-T01 ──→ S5-T03 ──→ S5-T04 ──→ S5-T05 ──→ S5-T06 ──→ S6-T03 ──→ S6-T04 ──→ S6-T05
S1-T02 (CodeArts)─┘                                                                                                                                                    │
S1-T03 (通知)─────→ S2-T05 ──→ S6-T01 ──→ S6-T02                                                                                                                       │
S1-T05 (前端骨架)─→ S2-T02 ──→ S3-T06 ──→ S4-T07 ──→ S5-T02 ──→ S5-T07 ──→ S6-T06                                                                                     │
S2-T04 (存储)────→ S4-T01                                                                                                                                             │
S7-T01 ──→ S7-T02 ──→ S7-T03 ──→ S7-T04 ──→ S7-T05 ──→ S7-T06                                                                                                         │
                                                                                                                                                                       ↓
                                                                                                                                                              S8-T01 → S8-T02 → S8-T04
```

**关键串行链**（决定项目最短工期）：
`S1-T01 → S1-T04 → S1-T06 → S1-T07 → S3-T03 → S4-T01 → S4-T03 → S5-T01 → S5-T03 → S6-T03 → S7-T03 → S7-T05 → S8-T02`

---

## 二十、MVP 完成的必要条件

1. ✅ 用户可注册/登录（摄影师 + 客户）
2. ✅ 客户可提交预约，摄影师可确认
3. ✅ 订单可从 PENDING_CONFIRM 流转到 ARCHIVED，非法转换被拒绝
4. ✅ 摄影师可上传 JPEG，系统自动分析并展示 4 项指标 + 风险提示
5. ✅ 摄影师可复核并修改判定，原片不被删除
6. ✅ 摄影师可发布选片集，客户可选片并提交（防重复）
7. ✅ 选片结果自动生成修图任务
8. ✅ 摄影师可上传预览，客户可反馈/确认
9. ✅ 摄影师可上传最终成片，客户可下载
10. ✅ 至少一种通知渠道在 5 个业务节点真实发送，有发送记录
11. ✅ 通知失败不影响订单状态
12. ✅ 数据库持久化 + Alembic 迁移可重复执行
13. ✅ 部署到华为云，公网可访问
14. ✅ E2E 测试至少 1 条完整闭环通过
15. ✅ 所有 P0 任务单测通过

---

## 二十一、端到端验收清单

- [ ] 客户注册并登录
- [ ] 客户提交预约（拍摄类型、日期、联系方式）
- [ ] 摄影师登录，工作台看到预约
- [ ] 摄影师确认预约，订单创建，状态=CONFIRMED
- [ ] 摄影师标记完成拍摄，状态=WAITING_UPLOAD
- [ ] 摄影师上传 5 张 JPEG（含虚焦/过曝/欠曝/正常/浅景深）
- [ ] 系统自动分析，状态=WAITING_REVIEW，每张照片有 4 项指标 + suggestion
- [ ] 浅景深照片未被误判为"建议排除"
- [ ] 摄影师复核，修改 1 张判定，原片仍在
- [ ] 摄影师发布选片集（max_select=3）
- [ ] 客户收到通知，进入选片页
- [ ] 客户选择 3 张并提交，尝试第 4 张被拒绝
- [ ] 重复提交返回 409
- [ ] 系统生成 3 个修图任务
- [ ] 摄影师上传预览图（version 1）
- [ ] 客户对 1 张提出修改意见，状态回退 RETOUCHING
- [ ] 摄影师上传 version 2，客户确认
- [ ] 摄影师上传最终成片，状态=DELIVERED
- [ ] 客户下载成片成功
- [ ] 非授权用户下载返回 403
- [ ] 订单归档，状态=ARCHIVED
- [ ] 全程通知记录可查，至少 5 条
- [ ] 模拟通知失败，订单状态仍正确
- [ ] 非法状态转换返回 409
- [ ] 客户无法访问摄影师接口（403）

---

## 二十二、竞赛演示前检查清单

- [ ] 演示环境公网可访问，HTTPS 有效
- [ ] 演示账号已准备（1 摄影师 + 1 客户）
- [ ] 测试图片已准备（5 张，含 3 张问题图）
- [ ] 数据库已重置为干净状态
- [ ] 通知渠道凭据有效，可实时发送
- [ ] 演示脚本（步骤 1-15）已打印/记忆
- [ ] 备用方案：若网络异常，有本地录屏/截图备份
- [ ] 华为云控制台可登录，可展示资源使用
- [ ] CodeArts 使用记录可展示
- [ ] 架构图已准备
- [ ] 测试报告（F1、通知成功率、闭环完成率）已填写实际值
- [ ] 浏览器缓存已清理
- [ ] 文件上传大小在限制内

---

## 二十三、项目风险清单

| 编号 | 风险 | 影响 | 应对 | 关联任务 |
|---|---|---|---|---|
| RK1 | 华为云服务不可用/计费超预期 | 无法部署 | 本地 Docker 兜底 + 适配层 | S1-T01、S7 |
| RK2 | CodeArts 能力不符预期 | 开发效率 | 保留本地开发路径 | S1-T02 |
| RK3 | 通知渠道不可用 | 通知功能 | 尝试备选渠道 + 站内待办兜底 | S1-T03、S6 |
| RK4 | OpenCV 误判创作类照片 | 用户体验 | 可解释指标 + 人工复核 + 不删原片 | S4-T04、S4-T08 |
| RK5 | 大图上传超时 | 上传失败 | 限制 20MB + 进度条 + 压缩 | S4-T01 |
| RK6 | 状态机非法跳转 | 数据不一致 | 集中状态机 + 单测覆盖 | S1-T07、S3-T03 |
| RK7 | 通知失败影响状态 | 业务异常 | 通知与状态解耦 + 单测 | S6-T02 |
| RK8 | 客户照片隐私泄露 | 安全问题 | 鉴权下载 + 访问期限 + 私有桶 | S6-T04、S7-T01 |
| RK9 | 前后端跨域 | 联调失败 | Vite proxy + Nginx 反代 | S7-T04 |
| RK10 | 范围蔓延 | 延期 | 严格 MVP 边界 + P1/P2 排后 | 全局 |

---

## 二十四、建议的 Git 提交节点

| 节点 | 分支 | 提交内容 | Tag |
|---|---|---|---|
| 1 | main | S1 完成：项目骨架 + 状态机 + 文档 | `v0.1.0-skeleton` |
| 2 | main | S2 完成：认证 + 存储/通知抽象 + 错误处理 | `v0.2.0-auth` |
| 3 | main | S3 完成：预约 + 订单工作流 | `v0.3.0-orders` |
| 4 | main | S4 完成：图片上传 + AI 初筛 + 复核 | `v0.4.0-analysis` |
| 5 | main | S5 完成：选片 + 修图协作 | `v0.5.0-selection-retouch` |
| 6 | main | S6 完成：通知 + 交付 + 归档 | `v0.6.0-delivery` |
| 7 | main | S7 完成：华为云部署 | `v0.7.0-deployed` |
| 8 | main | S8 完成：测试 + 竞赛材料 | `v1.0.0-mvp` |

> 每个阶段在 `develop` 分支开发，验证通过后合并 `main` 并打 tag。每个任务一个 feature 分支 + PR。

---

## 二十五、尚未完成但不影响 MVP 的 P1/P2 功能列表

### P1（对竞争力有明显提升，MVP 后优先）

| 功能 | 涉及模块 | 依赖 |
|---|---|---|
| 相似照片自动分组（感知哈希） | image_analyzer | S4 完成 |
| 多版本修图预览对比 | retouch | S5 完成 |
| 阈值自动校准（基于复核样本） | image_analyzer | S4 完成 + 足够样本 |
| 通知多渠道支持（企业微信 + Bark 同时） | notifier | S2-T05 |
| 通知频率控制/防骚扰 | notifier | S6 完成 |
| 客户选片集访问期限强制 | selections | S5 完成 |
| 操作日志/审计面板 | audit | S3 完成 |
| 性能压测与优化 | 全局 | S7 完成 |

### P2（有剩余时间再实现）

| 功能 | 涉及模块 |
|---|---|
| RAW 文件分析 | image_analyzer |
| Redis 缓存 / Celery 异步队列 | backend infra |
| 复杂图像质量模型（ML） | image_analyzer |
| 多工作室、多摄影师团队协作 | auth + orders |
| 专业自动修图 / 高级色彩处理 | retouch |
| 移动端适配 / 小程序 | frontend |
| 客户侧 AI 辅助选片推荐 | selections + AI |

---

## 二十六、待确认事项汇总（需优先验证）

| 编号 | 事项 | 阻塞的任务 | 建议验证时机 |
|---|---|---|---|
| Q1 | 华为云可用区域 | S7 全部 | S1-T01，立即 |
| Q2 | RDS PostgreSQL 可用性 | S7-T02 | S1-T01 |
| Q3 | OBS 可用性与计费 | S7-T01、S2-T04 | S1-T01 |
| Q4 | 计算服务选型（CCE/ECS/FunctionGraph） | S7-T03 | S1-T01 |
| Q5 | 域名与 HTTPS 证书 | S7-T04 | S1-T01 |
| Q6 | CodeArts 流水线能力 | S8-T04 | S1-T02 |
| Q7 | 通知渠道选定 | S2-T05、S6-T01 | S1-T03，立即 |
| Q8 | 通知渠道 API 凭据 | S2-T05 | S1-T03 |
| Q9 | 上传大小/数量限制 | S4-T01 | S1-T01 |
| Q10 | 客户选片集是否需登录 | S5-T02 | S3 开始前，产品决策 |
| Q11 | CodeArts Agent/Skills 范围 | S8-T04 | S1-T02 |

> **建议**：S1-T01/T02/T03 三个验证任务应在开发第一天并行完成，其结论直接影响 S2 和 S7 的实现方式。若任一验证失败，需在对应"待确认事项"中记录替代方案后再继续。

---

## 二十七、迭代执行说明

- 采用迭代开发，每次优先完成一个可运行的小模块。
- 每个阶段明确标注可并行 / 必须串行的任务（见各阶段末尾说明）。
- 不得一次性生成整个项目；每个任务有独立验收价值，不重复拆分。
- 先拆解技术验证与项目骨架（S1/S2），再逐步实现业务模块（S3~S6），最后部署测试（S7/S8）。
- 优先使用成熟、简单、可维护的方案；无必要时不引入微服务、复杂中间件、复杂权限系统。
- 对不确定的华为云产品、CodeArts 能力、外部 API，单独列出验证任务（S1-T01/T02/T03），不假设已可用。
- 所有自动判断（AI 初筛）都支持人工复核，不自动删除原片。
- 通知功能首期只交付一种渠道，但有发送记录、失败处理、重试逻辑。
