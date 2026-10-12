# LensFlow

AI 驱动的一站式摄影预约与智能交付中心。

## 快速启动

### 前置要求

- Python 3.11+
- Node.js 22+
- pnpm

### 后端

```bash
cd backend
cp .env.example .env
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端启动后访问：
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

### 前端

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev
```

前端启动后访问: http://localhost:5173

### 运行测试

```bash
# 后端测试
cd backend
python -m pytest -v

# 前端测试
cd frontend
npx vitest run
```

### 数据库迁移

```bash
cd backend
alembic upgrade head      # 应用迁移
alembic downgrade base    # 回滚全部
alembic revision --autogenerate -m "description"  # 生成新迁移
```

## 项目结构

```
lensflow/
├── backend/          # FastAPI 后端
│   ├── app/
│   │   ├── core/     # 配置、数据库、日志、异常
│   │   ├── models/   # ORM 模型
│   │   ├── services/ # 业务服务（状态机等）
│   │   └── api/      # API 路由
│   ├── alembic/      # 数据库迁移
│   └── tests/        # 后端测试
├── frontend/         # React 前端
│   └── src/
│       ├── pages/    # 页面组件
│       ├── api/      # API 客户端
│       ├── stores/   # 状态管理
│       └── types/    # 类型定义
└── docs/             # 项目文档
    ├── dev-plan.md   # 开发计划
    └── step-logs/    # 步骤记录
```

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.11 + FastAPI + SQLAlchemy 2.0 + Alembic |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| 数据库 | SQLite (开发) / PostgreSQL (生产) |
| 图像分析 | OpenCV + NumPy + Pillow |
| 部署 | Docker + 华为云 |

## 开发计划

详见 [docs/dev-plan.md](docs/dev-plan.md)。
