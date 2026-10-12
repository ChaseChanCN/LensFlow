# S7 阶段：华为云部署与竞赛演示

## 概述

S7 阶段准备了华为云部署所需的全部代码和配置，包括 OBS 存储、Docker 镜像、Nginx 反代和演示数据。实际部署需等待华为云资源确认（Q1-Q11）。

## 任务清单

| 任务 | 描述 | 状态 |
|------|------|------|
| S7-T01 | OBS 存储实现 | 代码完成，待云资源验证 |
| S7-T02 | 生产数据库配置 | 配置完成，待 RDS 验证 |
| S7-T03 | Docker 镜像与部署 | 配置完成，待构建验证 |
| S7-T04 | Nginx + HTTPS | 配置完成，待部署验证 |
| S7-T05 | 生产环境联调 | 待部署 |
| S7-T06 | 演示数据与账号 | 脚本完成 |
| S7-T07 | 部署问题排查记录 | 待部署 |

## 测试结果

- 后端：145 个测试全部通过
- 前端：30 个测试全部通过
- TypeScript/构建/lint 全部通过

---

## S7-T01：OBS 存储实现

### 实现目的

实现华为云 OBS 存储后端，生产环境替代 LocalStorage。

### 如何实现

文件：`backend/app/services/storage.py` 新增 `OBSStorage` 类

- 使用 `esdk-obs-python` SDK
- 实现 Storage ABC 的 4 个方法：save/get_path/delete/exists
- save：生成 UUID 文件名，putContent 上传到 OBS
- get_path：返回 OBS 公网 URL
- delete/exists：调用 SDK 删除/查询
- get_storage() 工厂根据 settings.storage_type 自动切换

配置项（config.py）：
- `obs_bucket` - OBS 桶名
- `obs_endpoint` - OBS 端点
- `obs_ak` - Access Key
- `obs_sk` - Secret Key

### 改进之处

- 与 LocalStorage 实现相同接口，业务代码无需修改
- 延迟导入 SDK，开发环境无需安装 esdk-obs-python

### 存在的问题

- 未实现分片上传（大文件）
- 未实现临时下载链接（带过期 token）
- 未处理 OBS 权限和桶策略

---

## S7-T02：生产数据库配置

### 实现目的

配置 PostgreSQL 生产数据库连接。

### 如何实现

config.py 已支持：
- `db_type=postgresql` 切换到 PostgreSQL
- `database_url` 属性生成 asyncpg 连接串
- `sync_database_url` 属性生成 psycopg2 连接串（Alembic 用）
- docker-compose.yml 配置 PostgreSQL 16 服务

### 改进之处

- 开发/生产配置通过环境变量切换，无需改代码
- 支持 asyncpg（异步）和 psycopg2（同步迁移）

### 存在的问题

- 未配置连接池参数
- 未实现数据库迁移 CI 流水线

---

## S7-T03：Docker 镜像与部署

### 实现目的

构建前后端 Docker 镜像，支持一键部署。

### 如何实现

- `backend/Dockerfile`：Python 3.12-slim + 依赖安装 + uvicorn 启动
- `frontend/Dockerfile`：多阶段构建（Node 构建 + Nginx 托管）
- `docker-compose.yml`：backend + frontend + PostgreSQL 三服务编排
- 华为云 PyPI 镜像加速依赖安装

### 改进之处

- 多阶段构建减小前端镜像体积
- docker-compose 一键启动全部服务
- 环境变量配置，不硬编码敏感信息

### 存在的问题

- 未配置 Docker 健康检查
- 未配置日志收集
- 未实现 CI/CD 自动构建推送

---

## S7-T04：Nginx + HTTPS

### 实现目的

Nginx 托管前端静态资源，反代后端 API。

### 如何实现

文件：`frontend/nginx.conf`

- 前端：`location /` try_files SPA 回退
- API 反代：`location /api/` proxy_pass backend:8000
- 上传限制：client_max_body_size 100m
- 超时配置：120s 读写超时

### 改进之处

- SPA 路由回退正确处理前端路由
- 大文件上传支持（100MB）
- 代理头正确传递

### 存在的问题

- 未配置 HTTPS（需 SSL 证书）
- 未配置 gzip 压缩
- 未配置缓存策略

---

## S7-T06：演示数据与账号

### 实现目的

准备竞赛演示用的测试账号和基础数据。

### 如何实现

文件：`backend/scripts/seed_demo.py`

- 摄影师账号：photographer@lensflow.demo / demo123456
- 客户账号：client@lensflow.demo / demo123456
- 自动创建一个已确认的预约和订单

### 改进之处

- 幂等执行，重复运行不会创建重复数据
- 密码使用 bcrypt 哈希存储

### 存在的问题

- 未创建完整流程的演示订单（含照片/选片/修图）
- 未准备演示用测试图片
