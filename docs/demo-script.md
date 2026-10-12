# LensFlow 竞赛演示脚本

## 演示账号

- 摄影师: photographer@lensflow.demo / demo123456
- 客户: client@lensflow.demo / demo123456

## 演示流程

### 1. 客户预约 (Client Booking)
1. 客户登录 -> 访问 /booking
2. 选择拍摄类型（婚礼/写真/活动）
3. 填写联系方式
4. 提交预约

### 2. 摄影师确认 (Photographer Confirm)
1. 摄影师登录 -> 工作台
2. 查看预约列表
3. 确认预约 -> 自动创建订单

### 3. 拍摄与上传 (Shoot & Upload)
1. 摄影师: 开始拍摄 -> 完成拍摄
2. 订单状态: WAITING_UPLOAD
3. 摄影师: 上传照片（JPEG）
4. AI 自动分析: 清晰度/亮度/高光/暗部
5. 订单状态: ANALYZING -> WAITING_REVIEW

### 4. AI 初筛与复核 (AI Analysis & Review)
1. 摄影师: 查看分析结果
2. AI 建议: 正常/需复核/建议剔除
3. 摄影师: 复核（保留/剔除/待定）
4. 摄影师: 发布选片集

### 5. 客户选片 (Client Selection)
1. 客户: 收到选片通知
2. 客户: 浏览可选照片
3. 客户: 选择照片（不超过 max_select）
4. 客户: 提交选片
5. 系统自动生成修图任务

### 6. 修图协作 (Retouch Collaboration)
1. 摄影师: 上传修图预览
2. 客户: 查看预览，提交反馈
3. 摄影师: 根据反馈修改，上传新版本
4. 客户: 确认修图结果
5. 订单状态: WAITING_DELIVERY

### 7. 交付与归档 (Delivery & Archive)
1. 摄影师: 上传最终成片（ZIP）
2. 客户: 收到交付通知
3. 客户: 下载成片
4. 摄影师: 归档订单

## 华为云服务使用

| 服务 | 用途 |
|------|------|
| CodeArts | 代码开发与版本管理 |
| OBS | 照片和成片存储 |
| RDS PostgreSQL | 生产数据库 |
| CCE/弹性云服务器 | 应用部署 |
| IAM | 访问密钥管理 |

## 技术栈

- 后端: FastAPI + SQLAlchemy + Alembic + OpenCV
- 前端: React 19 + TypeScript + Vite + Tailwind CSS v4
- 状态机: 14 状态 17 合法转换
- 认证: JWT + RBAC（摄影师/客户/管理员）
- 通知: Bark + 企业微信（带重试）
- AI: OpenCV 4 项指标 + 3 级风险判定
