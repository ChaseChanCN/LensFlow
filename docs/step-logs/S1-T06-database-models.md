# S1-T06 数据库模型与初始迁移

## 实现目的

实现全部 16 个 ORM 模型并配置 Alembic 迁移，使 `alembic upgrade head` 可创建所有表，`alembic downgrade base` 可回滚，为后续业务模块提供数据持久化基础。

## 如何实现

### 创建的文件

| 文件 | 内容 |
|---|---|
| `app/models/base.py` | DeclarativeBase + IdMixin + TimestampMixin |
| `app/models/user.py` | User（email, password_hash, name, role, phone, is_active） |
| `app/models/booking.py` | Booking（client_id, photographer_id, shoot_type, preferred_date, status） |
| `app/models/order.py` | Order + OrderTimeline（14 状态枚举，timeline 记录每次流转） |
| `app/models/photo.py` | Photo（order_id, filename, storage_key, mime, size, dimensions） |
| `app/models/analysis.py` | AnalysisResult（4 项指标 + suggestion + risk_level + 复核字段） |
| `app/models/selection.py` | SelectionSet + SelectionItem + SelectionSubmission |
| `app/models/retouch.py` | RetouchTask + RetouchVersion + RetouchFeedback |
| `app/models/delivery.py` | Delivery（order_id, storage_key, filename） |
| `app/models/notification.py` | NotificationLog（channel, status, retry_count, error） |
| `app/models/todo.py` | TodoItem（assignee, order, type, due_date, done） |
| `app/models/audit.py` | AuditLog（user, action, entity, payload） |
| `app/models/__init__.py` | 统一导出所有模型 |
| `alembic.ini` | Alembic 配置 |
| `alembic/env.py` | 迁移环境（从 settings 读取 URL，SQLite 用 batch 模式） |
| `alembic/script.py.mako` | 迁移脚本模板 |
| `alembic/versions/5e0b2fd720d3_initial_schema.py` | 自动生成的初始迁移 |

### 关键设计

1. **IdMixin + TimestampMixin**：统一 id/created_at/updated_at，减少重复代码。
2. **OrderStatusType**：使用 `Literal` 类型定义 14 个状态，类型安全。
3. **OrderTimeline**：独立表记录每次状态流转（from_status, to_status, actor, action）。
4. **AnalysisResult**：4 项指标（sharpness_score, brightness_mean, highlight_ratio, shadow_ratio）+ suggestion + risk_level + 复核字段（reviewed, reviewer_id, final_decision）。
5. **NotificationLog**：含 retry_count 和 error_message，支持失败重试记录。
6. **SQLite batch 模式**：env.py 中 `render_as_batch=True`，SQLite ALTER TABLE 需要批处理。

### 迁移验证结果

```
alembic upgrade head      -> 16 表创建成功
alembic downgrade base    -> 全部回滚成功
alembic upgrade head      -> 重新创建成功
```

检测到的表：users, bookings, orders, order_timelines, photos, analysis_results, selection_sets, selection_items, selection_submissions, retouch_tasks, retouch_versions, retouch_feedbacks, deliveries, notification_logs, todo_items, audit_logs。

## 改进之处

- 模型按业务域分文件，清晰可维护。
- 使用 SQLAlchemy 2.0 的 `Mapped` + `mapped_column` 声明式风格，类型安全。
- TimestampMixin 的 `updated_at` 使用 `onupdate=func.now()` 自动更新。
- Alembic URL 从 settings 动态读取，支持 SQLite/PostgreSQL 切换。
- 关键字段添加索引（order_id, client_id, status, email 等）。

## 存在的问题

1. **无外键约束**：当前模型未定义 ForeignKey 约束（仅用 int 字段 + 索引），便于迁移和测试。生产可按需添加。
2. **Literal 类型在 SQLite 中存储为 String**：`Literal` 类型在 ORM 层提供类型检查，数据库层存储为 String。
3. **无种子数据**：初始迁移只建表，无默认数据（如管理员账号），待 S2 阶段添加。

## 验收标准

- [x] `alembic upgrade head` 创建所有 16 张表
- [x] `alembic downgrade base` 可回滚
- [x] 重复 upgrade/downgrade 循环成功
- [x] 表结构与模型定义一致
