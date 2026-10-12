# S1-T04 后端项目骨架

## 实现目的

创建 FastAPI 后端项目基础结构，包含配置管理、数据库引擎、日志、统一异常处理和健康检查端点，使后端可启动、可调试、Swagger UI 可访问，为后续业务模块提供坚实基础。

## 如何实现

### 创建的文件

| 文件 | 作用 |
|---|---|
| `backend/pyproject.toml` | 项目配置、依赖声明、pytest/ruff/mypy 配置 |
| `backend/.env.example` | 环境变量模板（DB/Storage/JWT/通知/CORS） |
| `backend/app/__init__.py` | 包标识 |
| `backend/app/main.py` | FastAPI 应用入口，CORS、异常处理、健康检查 |
| `backend/app/core/__init__.py` | 包标识 |
| `backend/app/core/config.py` | pydantic-settings 配置，支持 SQLite/PostgreSQL 切换 |
| `backend/app/core/database.py` | SQLAlchemy 引擎和会话管理 |
| `backend/app/core/logging.py` | 统一日志配置 |
| `backend/app/core/exceptions.py` | 统一异常体系（AppException 及子类） |
| `backend/tests/conftest.py` | pytest fixture（TestClient） |
| `backend/tests/test_health.py` | 健康检查、根路径、Swagger UI、404 格式测试 |

### 关键设计

1. **配置管理**：`Settings` 类使用 pydantic-settings，从 `.env` 读取，`@lru_cache` 单例。`database_url` 和 `sync_database_url` 属性根据 `db_type` 自动切换 SQLite/PostgreSQL。
2. **数据库**：同步引擎（Alembic 迁移用），SQLite 时禁用 `check_same_thread`。`get_db` 依赖注入。
3. **异常体系**：`AppException` 基类 + 子类（NotFound/Unauthorized/Forbidden/Conflict/InvalidStateTransition/Validation），统一 handler 返回 `{code, message, detail}` 格式。
4. **CORS**：从环境变量读取允许的源列表。

### 依赖安装

使用华为云 PyPI 镜像（`https://repo.huaweicloud.com/repository/pypi/simple/`）安装，解决默认源超时问题。

### 测试结果

```
tests/test_health.py::test_health_check PASSED
tests/test_health.py::test_root_endpoint PASSED
tests/test_health.py::test_docs_accessible PASSED
tests/test_health.py::test_error_format PASSED
4 passed in 0.02s
```

## 改进之处

- 配置通过 pydantic-settings 类型安全，避免硬编码。
- 数据库 URL 自动切换，本地 SQLite / 生产 PostgreSQL 无缝切换。
- 异常体系统一，前端可按 `code` 字段处理不同错误类型。
- `InvalidStateTransitionException` 已预定义，为 S1-T07 状态机做准备。
- 环境变量预留了通知渠道配置位（Bark/企业微信），为 S1-T03 做准备。

## 存在的问题

1. **StarletteDeprecationWarning**：TestClient 使用 httpx 有弃用警告，需后续安装 httpx2 或忽略。
2. **同步引擎**：当前使用同步 SQLAlchemy 引擎，后续如需异步可引入 asyncpg + async session（当前 MVP 不需要）。
3. **bcrypt 依赖**：passlib[bcrypt] 安装时可能有编译依赖，当前环境已正常安装。
4. **opencv 体积较大**：opencv-python-headless 约 40MB，但为 S4 图像分析必需。

## 验收标准

- [x] `uvicorn app.main:app` 可启动
- [x] `GET /health` 返回 200 + `{"status":"ok"}`
- [x] Swagger UI `/docs` 可访问
- [x] 4 个测试全部通过
- [x] `.env.example` 配置完整
