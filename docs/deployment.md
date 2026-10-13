# LensFlow 部署指南

本指南基于 Docker Compose，支持本地文件存储和华为云 OBS 两种模式。

## 前置要求

- Docker 20.10+ 与 Docker Compose v2+
- 端口 80（前端）、8000（后端 API）、5432（PostgreSQL）可用

## 快速部署（本地存储模式）

适用于无华为云 OBS 凭证的本地 / 私有服务器部署。

### 1. 配置环境变量

在项目根目录创建 `.env`（已被 `.gitignore` 排除，不会提交）：

```bash
# 生成随机密钥
DB_PASSWORD=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
JWT_SECRET=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")
cat > .env <<EOF
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
CORS_ORIGINS=*
EOF
```

### 2. 构建并启动

```bash
docker compose up --build -d
```

首次启动时后端会自动执行 `alembic upgrade head` 完成数据库迁移。

### 3. 验证

```bash
docker compose ps                          # 三个服务应为 Up / healthy
curl http://localhost:8000/health          # 后端健康检查
curl -o /dev/null -w "%{http_code}" http://localhost:80/   # 前端应返回 200
```

### 服务地址

| 服务 | 地址 | 说明 |
|---|---|---|
| 前端 | http://localhost:80 | nginx 托管 React 静态产物 |
| 后端 API | http://localhost:8000 | FastAPI，`/docs` 查看 Swagger |
| 数据库 | localhost:5432 | PostgreSQL 16 |

前端 nginx 已将 `/api/` 反向代理到后端，浏览器只需访问 80 端口。

## 使用华为云 OBS 存储

若需生产级对象存储，编辑 `docker-compose.yml` 的 `backend.environment`：

```yaml
- STORAGE_TYPE=obs
- OBS_BUCKET=<your-bucket>
- OBS_ENDPOINT=<your-endpoint>
- OBS_AK=<your-ak>
- OBS_SK=<your-sk>
```

并在 `backend/Dockerfile` 中追加安装 OBS SDK：

```dockerfile
RUN pip install --no-cache-dir esdk-obs-python
```

## 环境变量说明

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_PASSWORD` | `changeme` | PostgreSQL 密码（生产必须修改） |
| `JWT_SECRET` | `change-this...` | JWT 签名密钥（生产必须修改） |
| `CORS_ORIGINS` | `*` | 允许的前端来源，逗号分隔 |
| `STORAGE_TYPE` | `local` | `local` 或 `obs` |
| `BARK_DEVICE_KEY` | （空） | Bark 推送设备 key，不填则跳过通知 |

## 常用运维命令

```bash
docker compose logs -f backend        # 跟踪后端日志
docker compose restart backend        # 重启后端
docker compose down                   # 停止并移除容器（保留数据卷）
docker compose down -v                # 停止并删除数据卷（⚠️ 清空数据库）
docker compose up -d --build backend  # 仅重建后端
```

上传文件持久化在命名卷 `lensflow_storage`（映射到容器 `/app/storage_local`），
数据库持久化在 `pgdata` 卷。`docker compose down` 不会删除它们。

## 故障排查

### 后端启动失败：缺少数据库驱动

若日志出现 `No module named 'psycopg2'` 或 `asyncpg`，确认 `backend/Dockerfile`
已安装 `psycopg2-binary` 与 `asyncpg`。本仓库的 Dockerfile 已包含。

### 后端启动失败：email-validator 未安装

若日志出现 `email-validator is not installed`，确认 `backend/Dockerfile` 安装了
`pydantic[email]`（等价于 `pydantic` + `email-validator`）。

### 前端构建失败：pnpm 供应链策略

pnpm 12 默认启用 `minimumReleaseAge` 供应链策略，会拦截发布时间过短的包。
本仓库 `frontend/Dockerfile` 已通过 `--trust-lockfile` 跳过该校验。

### 前端构建失败：tsc not found

pnpm 12 的 `verifyDepsBeforeRun` 会在 `pnpm run` 前触发依赖同步，可能被供应链
策略破坏 `node_modules`。本仓库 Dockerfile 直接调用 `node_modules/.bin/tsc` 与
`node_modules/.bin/vite`，绕过该问题。

### buildx 构建时 DNS 解析失败

若构建拉取基础镜像时报 `lookup ... connection refused`，但 `docker pull` 可成功，
说明 buildx 的 DNS 路径异常。解决：先手动预拉基础镜像再构建：

```bash
docker pull python:3.12-slim node:22-slim nginx:alpine postgres:16-alpine
docker compose up --build -d
```

### 端口被占用

修改 `docker-compose.yml` 中对应服务的端口映射（如 `"8080:80"`）。

## 架构说明

```
浏览器 ──80──▶ nginx (前端静态) ──/api/──▶ backend:8000 (FastAPI)
                                              │
                                              ▼
                                         postgres:5432
```

- 前端构建产物（`dist/`）由 nginx 托管，非 `/api/` 请求走 SPA fallback。
- 后端通过 `alembic` 管理数据库 schema，容器启动时自动迁移。
- 文件存储抽象层 `app/services/storage.py` 支持 `local` / `obs` 切换。
