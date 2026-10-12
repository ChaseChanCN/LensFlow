# S1-T07 订单状态机实现

## 实现目的

实现集中的订单状态机，封装 14 个状态和 17 条合法转换规则，禁止业务代码直接修改订单状态。所有状态流转必须经过状态机验证，非法转换抛出异常，角色不匹配抛出权限异常。

## 如何实现

### 创建的文件

| 文件 | 内容 |
|---|---|
| `app/services/__init__.py` | 服务层包标识 |
| `app/services/order_state.py` | OrderStatus 枚举 + TRANSITIONS 转换表 + OrderStateMachine 类 |
| `tests/test_state_machine.py` | 44 个测试用例 |

### 关键设计

1. **OrderStatus 枚举**：继承 `str, Enum`，14 个状态，JSON 序列化友好。
2. **TRANSITIONS 转换表**：嵌套字典 `{from_status: {to_status: {allowed_roles}}}`，集中定义全部 17 条合法转换。
3. **TERMINAL_STATES**：`frozenset({ARCHIVED, CANCELLED})`，终态不可转出。
4. **OrderStateMachine** 静态方法：
   - `transition(from, to, role)` -> 验证并返回新状态，非法抛 `InvalidStateTransitionException`，角色不匹配抛 `ForbiddenException`
   - `can_transition(from, to)` -> bool
   - `get_allowed_targets(from)` -> set
   - `get_allowed_roles(from, to)` -> frozenset
   - `is_terminal(status)` -> bool

### 测试覆盖

| 测试类 | 用例数 | 说明 |
|---|---|---|
| TestLegalTransitions | 21 | 全部 17 个 from->to 对（含多角色组合） |
| TestIllegalTransitions | 8 | 跳过状态、终态转出、非法回退 |
| TestRolePermissions | 4 | 错误角色被拒绝 |
| TestTerminalStates | 4 | 终态/非终态判断 |
| TestAllowedTargets | 4 | 允许目标状态查询 |
| TestCanTransition | 3 | 布尔判断辅助方法 |
| **合计** | **44** | **全部通过** |

### 测试结果

```
44 passed, 1 warning in 0.05s
```

## 改进之处

- 状态机完全集中化，业务代码无法绕过验证直接改 status。
- 转换表使用嵌套字典，一目了然，新增转换只需加一行。
- 角色权限内置于转换表，不需要单独的权限检查逻辑。
- `system` 角色用于自动触发（如上传后自动进入 ANALYZING）。
- 异常类型区分：非法转换用 `InvalidStateTransitionException`（409），角色不匹配用 `ForbiddenException`（403）。
- 测试用 `parametrize` 表驱动，新增转换自动需要加测试用例。

## 存在的问题

1. **未写入 OrderTimeline**：当前状态机只做验证，不写数据库。Timeline 写入由调用方负责（S3-T04 实现）。
2. **无状态回退机制**：除 WAITING_CLIENT_CONFIRM -> RETOUCHING 外，不支持其他回退。如需支持需扩展转换表。
3. **无并发控制**：多个请求同时转换同一订单可能导致竞态，需在 S3 阶段加乐观锁。

## 验收标准

- [x] 17 条合法转换全部测试通过（21 个含多角色）
- [x] 8 条非法转换抛出 InvalidStateTransitionException
- [x] 4 条角色权限违规抛出 ForbiddenException
- [x] 终态（ARCHIVED, CANCELLED）不可转出
- [x] 44 个测试用例全部通过
