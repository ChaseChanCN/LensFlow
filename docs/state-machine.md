# 订单状态机

## 状态枚举（14 个）

| 状态 | 中文名 | 说明 |
|---|---|---|
| PENDING_CONFIRM | 待确认预约 | 客户提交预约后初始状态 |
| CONFIRMED | 已确认预约 | 摄影师确认预约 |
| WAITING_SHOOT | 待拍摄 | 等待拍摄执行 |
| WAITING_UPLOAD | 待上传照片 | 拍摄完成，等待上传 |
| ANALYZING | AI 初筛处理中 | 系统正在分析图片 |
| WAITING_REVIEW | 待摄影师复核 | 分析完成，等待复核 |
| WAITING_SELECTION | 待客户选片 | 摄影师发布选片集 |
| WAITING_RETOUCH | 待修图 | 客户提交选片 |
| RETOUCHING | 修图处理中 | 摄影师正在修图 |
| WAITING_CLIENT_CONFIRM | 待客户确认 | 预览已上传，等待确认 |
| WAITING_DELIVERY | 待最终交付 | 客户确认，等待最终成片 |
| DELIVERED | 已交付 | 最终成片已上传 |
| ARCHIVED | 已归档 | 终态，订单归档 |
| CANCELLED | 已取消 | 终态，订单取消 |

## 合法转换（17 条）

| # | 当前状态 | 目标状态 | 允许角色 | 动作 |
|---|---|---|---|---|
| 1 | PENDING_CONFIRM | CONFIRMED | photographer | 确认预约 |
| 2 | PENDING_CONFIRM | CANCELLED | photographer, client | 拒绝/取消 |
| 3 | CONFIRMED | WAITING_SHOOT | system, photographer | 进入拍摄 |
| 4 | CONFIRMED | CANCELLED | photographer, client | 取消 |
| 5 | WAITING_SHOOT | WAITING_UPLOAD | photographer | 完成拍摄 |
| 6 | WAITING_SHOOT | CANCELLED | photographer | 取消 |
| 7 | WAITING_UPLOAD | ANALYZING | system | 触发分析 |
| 8 | ANALYZING | WAITING_REVIEW | system, photographer | 分析完成/强制复核 |
| 9 | WAITING_REVIEW | WAITING_SELECTION | photographer | 发布选片集 |
| 10 | WAITING_SELECTION | WAITING_RETOUCH | client | 提交选片 |
| 11 | WAITING_RETOUCH | RETOUCHING | photographer | 开始修图 |
| 12 | RETOUCHING | WAITING_CLIENT_CONFIRM | photographer | 上传预览 |
| 13 | WAITING_CLIENT_CONFIRM | RETOUCHING | client | 要求修改 |
| 14 | WAITING_CLIENT_CONFIRM | WAITING_DELIVERY | client | 确认 |
| 15 | WAITING_DELIVERY | DELIVERED | photographer | 上传最终成片 |
| 16 | DELIVERED | ARCHIVED | system, photographer | 归档 |

## 终态

- ARCHIVED：不可转出
- CANCELLED：不可转出

## 规则

1. 不在表中的转换抛 `InvalidStateTransitionException`（HTTP 409）。
2. 角色不匹配抛 `ForbiddenException`（HTTP 403）。
3. 每次转换写入 `OrderTimeline` 表（actor, action, from_status, to_status, timestamp）。
4. `system` 角色用于自动触发（如上传后自动进入 ANALYZING）。

## 实现位置

- 状态机: `backend/app/services/order_state.py`
- 测试: `backend/tests/test_state_machine.py`（44 个用例）
