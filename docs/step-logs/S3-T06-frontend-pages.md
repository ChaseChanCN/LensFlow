# S3-T06 前端预约与订单页面

## 实现目的

创建客户预约提交页面、摄影师订单列表页面、订单详情页面（含状态流转操作和 Timeline 展示），更新工作台首页显示预约和订单概览，使前端可操作完整的预约-订单流程。

## 如何实现

### 创建的文件

| 文件 | 内容 |
|---|---|
| `src/api/bookings.ts` | 预约 API 客户端（create/list/confirm/cancel） |
| `src/api/orders.ts` | 订单 API 客户端（list/get/updateStatus/timeline） |
| `src/pages/client/BookingPage.tsx` | 客户预约提交页（拍摄类型/日期/联系方式/备注） |
| `src/pages/photographer/OrdersPage.tsx` | 订单列表页（表格，状态标签，查看链接） |
| `src/pages/photographer/OrderDetailPage.tsx` | 订单详情页（信息/状态操作/Timeline） |
| `src/pages/client/BookingPage.test.tsx` | 预约页测试（3 个） |
| `src/pages/photographer/OrdersPage.test.tsx` | 订单列表测试（2 个） |

### 修改的文件

| 文件 | 变更 |
|---|---|
| `src/App.tsx` | 添加 /booking、/orders/:id 路由 |
| `src/pages/photographer/DashboardPage.tsx` | 接入预约和订单数据，显示概览统计 |

### 关键设计

1. **简约风格**：全部页面灰黑白色系，无 emoji，表格/卡片/表单布局。
2. **客户预约页**：拍摄类型下拉选择（5 种），日期/联系方式/备注，提交成功显示编号。
3. **订单列表页**：表格展示编号/状态/创建时间/查看链接，状态用中文标签。
4. **订单详情页**：订单信息卡片 + 状态操作按钮（根据当前状态显示可用操作）+ Timeline 操作记录。
5. **工作台首页**：统计卡片（待确认预约/进行中订单/总订单数）+ 待确认预约列表。
6. **TanStack Query**：数据请求使用 useQuery，状态变更使用 useMutation + invalidateQueries。

### 测试结果

```
前端: 5 test files, 12 tests passed
后端: 87 tests passed
tsc --noEmit: 无错误
vite build: 成功
```

## 改进之处

- 所有页面保持简约风格，无 emoji。
- 订单详情页根据当前状态动态显示操作按钮，引导摄影师按流程操作。
- 状态标签全部中文化，用户体验友好。
- 工作台首页一目了然显示待办概览。
- 测试 mock API 层，不依赖后端运行。

## 存在的问题

- 预约确认操作未在工作台 UI 实现（需摄影师确认按钮），待后续补充。
- 订单详情页未显示客户信息，待后续补充。
- 无分页，订单量大时需优化。
- BookingPage 无需登录即可访问（未用 ProtectedRoute），因为客户可能未注册就预约。待产品决策（Q10）。

## 验收标准

- [x] 客户可提交预约（预约页）
- [x] 摄影师可查看订单列表（订单列表页）
- [x] 摄影师可查看订单详情和操作记录（订单详情页）
- [x] 摄影师可执行状态流转操作（订单详情页）
- [x] 工作台显示预约和订单概览
- [x] 12 个前端测试通过
- [x] TypeScript 编译无错误
- [x] build 成功
