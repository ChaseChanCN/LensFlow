# S3-T01~T05 + T07 预约与订单工作流（后端）

## 实现目的

实现预约提交/确认、订单创建/查询、订单状态流转（走状态机）、操作记录 Timeline、待办事项自动生成和权限隔离&隔离测试，完成平台业务主干。

## 如何实现

### 创建的文件

| 文件 | 内容 | 任务 |
|---|---|---|
| `app/schemas/booking.py` | 预约 DTO（Create/Response/Confirm） | T01 |
| `app/schemas/order.py` | 订单 DTO（Response/StatusUpdate/Timeline） | T02+T03+T04 |
| `app/schemas/todo.py` | 待办 DTO（Response/Update） | T05 |
| `app/api/v1/bookings.py` | 预约路由（create/list/get/confirm/cancel） | T01 |
| `app/api/v1/orders.py` | 订单路由（list/get/status/timeline）+ 待办生成0生成 | T02+T03+T04+T05 |
| `app/api/v1/todos.py` | 待办路由（list/update） | T05 |
| `tests/test_orders.py` | 15 个测试覆盖全部功能 + 权限隔离 | T01~:T07 |

### 关键设计

1. **预约确认自动创建订单**：PATCH /bookings/{id}/confirm 时自动创建 Order，状态为 CONFIRMED。
2. **状态流转走状态机**：PATCH /orders/{id}/status 调用 `OrderStateMachine.transition`，非法转换返回 409，角色不匹配返回 403。
3. **Timeline 自动记录**：每次状态变更写入 OrderTimeline（from@from_status, to_status, actor_id, action）。
4. **待办自动生成**：关键状态（WAITING_UPLOAD/WAITING_REVIEW/WAITING_SELECTION/WAITING_RETOUCH/WAITING_DELIVERY）自动生成 TodoItem。
5. **权限隔离**：客户只能看自己的预约/订单，摄影师只能看分配给自己的，角色不匹配返回 403。

### 测试结果

```
15 passed in 9.897s

TestBookingCreate: 4 tests (客户创建/摄影师不能创建/列表/详情)
TestBookingConfirm: 3 tests (确认创建订单/客户不能确认/取消)
TestOrderStatus: 3 tests (合法转换/非法转换409/角色权限403)
TestOrderTimeline: 1 test (Timeline记录转换)
TestTodoAutoGenerate: 2 tests (自动生成/标记完成)
TestPermissionIsolation: 2 tests (预约隔离/订单隔离)
```

## 改进之处

- �9约确认和订单创建在同一事务中，保证一致性。
- 状态流转<流转、Timeline 记录、待办生成在一次请求中完成，无需额外调用。
- 权限隔离通过 require_role + 查询过滤实现，不依赖前端。
- 测试覆盖合法/非法转换、角色权限>权限、数据隔离。

## 存在的问题

- 无乐观锁：并发状态C状态变更可能竞态，待后续加 version 字段。
- 预约详情未做所有权检查（任何登录用户可查看任何预约），待后续加权限。
- 待办生成只针对摄影师，客户侧待办待后续。

## 验收标准

- [x] 客户可提交预约，摄影师可确认/取消
- [x] 确认预约自动创建订单
- [x] 订单状态流转走状态机，非法转换返回 409
- [x] Timeline 记录每次转换
- [x] 关键状态自动生成待办
-* [x] 权限隔离：角色不匹配返回 403，数据按角色过滤
- [x] 15 个测试全部通过
