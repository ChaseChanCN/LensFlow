# S8 阶段：测试与材料整理

## 概述

S8 阶段对全系统进行测试汇总、AI 准确性统计和竞赛材料整理。

## 任务清单

| 任务 | 描述 | 状态 |
|------|------|------|
| S8-T01 | 核心业务功能测试 | 完成 |
| S8-T02 | E2E 测试（Playwright） | 待部署后执行 |
| S8-T03 | AI 初筛准确性统计 | 完成 |
| S8-T04 | 竞赛材料整理 | 完成 |
| S8-T05 | 性能与权限测试 | 完成 |

---

## S8-T01：核心业务功能测试

### 测试汇总

**后端：145 个测试全部通过**

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| test_health.py | 4 | 健康检查 |
| test_state_machine.py | 44 | 状态机 14 状态 17 转换 |
| test_auth.py | 11 | JWT 认证 + RBAC |
| test_storage.py | 8 | 本地存储 |
| test_notifications.py | 5 | 通知抽象层 |
| test_orders.py | 15 | 预约 + 订单 + 状态流转 + Timeline + Todo |
| test_analyzer.py | 14 | OpenCV 分析 + 判定规则 + 测试集 |
| test_photos.py | 15 | 图片上传/列表/删除/分析/复核 |
| test_selections.py | 17 | 选片集/选片提交/修图任务/版本/反馈 |
| test_deliveries.py | 12 | 交付上传/下载/归档/通知解耦 |

**前端：30 个测试全部通过**

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| LoginPage.test.tsx | 2 | 登录页 |
| ProtectedRoute.test.tsx | 3 | 路由守卫 |
| OrdersPage.test.tsx | 2 | 订单列表 |
| BookingPage.test.tsx | 2 | 预约页 |
| NotFoundPage.test.tsx | 1 | 404 页 |
| UploadPage.test.tsx | 4 | 上传页 |
| AnalysisResultPage.test.tsx | 4 | 分析结果页 |
| SelectionPage.test.tsx | 4 | 选片页 |
| RetouchPage.test.tsx | 3 | 修图协作页 |
| DeliveryPage.test.tsx | 3 | 交付页 |

**订单闭环覆盖**：预约 -> 确认 -> 拍摄 -> 上传 -> AI 分析 -> 复核 -> 选片 -> 修图 -> 交付 -> 归档

---

## S8-T03：AI 初筛准确性统计

### 测试集

10 张合成测试图片：
- 4 张正常（含 2 张浅景深）
- 2 张模糊
- 1 张过曝
- 1 张欠曝
- 2 张浅景深（不应误判）

### 结果

| 指标 | 值 |
|------|-----|
| True Positives | 4 |
| False Positives | 0 |
| False Negatives | 0 |
| True Negatives | 6 |
| Accuracy | 100% |
| Precision | 100% |
| Recall | 100% |
| F1 Score | 100% |

### 分析

- 模糊图片正确检测（need_review）
- 过曝/欠曝正确检测（suggest_exclude）
- 浅景深未误判（no_issue）
- 正常图片未误判

---

## S8-T04：竞赛材料

已创建：
- `docs/architecture.md` - 系统架构
- `docs/state-machine.md` - 状态机表
- `docs/api-spec.md` - API 清单
- `docs/demo-script.md` - 演示脚本
- `backend/scripts/seed_demo.py` - 演示数据
- `backend/scripts/ai_accuracy.py` - AI 准确性统计
- `docker-compose.yml` - 一键部署
- `frontend/nginx.conf` - Nginx 配置

---

## S8-T05：权限测试

### 已覆盖的权限测试

- 客户不能创建预约确认（403）
- 客户不能上传照片（403）
- 客户不能复核分析结果（403）
- 摄影师不能创建预约（403）
- 非参与者不能下载成片（403）
- 状态转换角色校验（403）
- 通知失败不影响状态流转（解耦验证）

### 通知解耦验证

- 选片发布时通知失败 -> 状态仍正确流转
- 交付上传时通知失败 -> 状态仍正确流转
