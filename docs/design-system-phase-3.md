# Phase 3 试点页面迁移

实施日期：2026-10-16；分支：`design-system`。

## 本阶段改动

| 页面 | 迁移内容 |
| --- | --- |
| LoginPage | `Input variant="grouped"`、原生 name/autocomplete 和无障碍名称、错误 alert 与说明关联、Button loading、main 地标、强对比度文字与焦点轮廓 |
| DashboardPage | EmptyState / Spinner、区分加载/失败/空数据、错误重试、确认按钮 loading、移除嵌套按钮、使用 Link/navigate、减少动态效果时立即滚动 |
| OrdersPage | EmptyState / Spinner、请求失败与重试、React Router 详情跳转、保留状态标签映射 |

配套修正：摄影师登录/注册后的目标和 Layout 工作台链接统一为已有 `/dashboard` 路由；客户端仍到 `/client`。Layout 活动项提供 `aria-current`。ListGroup、LargeTitle、ListItem、Badge 改用普通字号可读的文字颜色令牌，ListItem 提供键盘焦点轮廓。共享样式调整会影响其他复用页面。

API、预约确认与订单查询仍使用原模块。订单状态映射抽离继续留作可选技术债务。

## 功能与交互验证

- 试点页面及注册回归共 **25/25** 测试通过；UI 组件 **45/45** 通过。
- 全量 **85/95** 通过，剩余 10 项均为 P2 已记录的其他页面旧失败；原登录页、订单页的 4 项旧失败已消除，无新增失败。
- 登录：原生必填校验、Tab 顺序、Enter 提交、三种角色跳转、token/user 保存、loading 禁止重复点击、失败说明与重试、注册链接。
- 工作台：异步加载时不误显示空数据，请求失败不显示零数量，预约确认调用参数、两组查询失效、错误提示、详情链接与独立确认按钮。
- 订单：列表/空数据/失败/重试、状态徽章、键盘打开详情、前进/后退、工作台导航与退出。
- 真实浏览器使用模拟 API 验证登录成功与失败、工作台链接、订单详情和历史导航、输入框与确认按钮可见焦点。错误请求按原 QueryClient 默认策略重试，期间显示 Spinner。
- 三个页面在 **375 / 768 / 1280px** 宽度下检查过，无横向溢出；手机截图使用 375×844。
- TypeScript 和生产构建通过；ESLint 无错误，保留 DarkroomVideoBackground 原有 2 项警告。令牌编译、12 组推荐文字对比度和粒子 reduced-motion 检查通过。

## 视觉变化

保留原有页面宽度、白色分组卡片和基础层级。预期变化包括：空状态增加图标、标题和说明；低对比度文字及徽章颜色加深；工作台导航正确标记活动项；键盘焦点可见；分组标题采用 caption 令牌的行高。因此不声称与迁移前逐像素一致。

| 页面 | 迁移前 | 迁移后 | 手机 |
| --- | --- | --- | --- |
| 登录 | [截图](design-system-screenshots/phase-3-login-before.jpg) | [截图](design-system-screenshots/phase-3-login-after.jpg) | [截图](design-system-screenshots/phase-3-login-mobile.jpg) |
| 工作台空状态 | [截图](design-system-screenshots/phase-3-dashboard-before.jpg) | [截图](design-system-screenshots/phase-3-dashboard-after.jpg) | [有数据截图](design-system-screenshots/phase-3-dashboard-mobile.jpg) |
| 订单空状态 | [截图](design-system-screenshots/phase-3-orders-before.jpg) | [截图](design-system-screenshots/phase-3-orders-after.jpg) | [有数据截图](design-system-screenshots/phase-3-orders-mobile.jpg) |

另有 [工作台有数据截图](design-system-screenshots/phase-3-dashboard-populated.jpg)。

## 性能与自动无障碍检查

完整数字、方法、原始基线与 P2 比较见 [P3 机器结果](design-system-phase-3-results.json)。原始 P1 报告保留不覆盖。以最终生产构建测试本地空数据页面；API base 仅在预览服务内转换为同源，并提供相同模拟响应，磁盘构建产物不做改写。

| 页面 | 最终性能中位数 | 自动无障碍中位数 | FCP / LCP 中位数 |
| --- | --- | --- | --- |
| 登录 | 100 | 100（原 89） | 606 / 606ms |
| 工作台 | 100 | 100（原 91） | 605 / 653ms |
| 订单 | 100 | 100（迁移前 91） | 603 / 645ms |
| 粒子内容文档 | 88（原 96） | 100 | 1207 / 1207ms |

每页最终测量 3 次。三个试点性能未降分，FCP 相对原基线增长约 7%，LCP 基本不变；订单相对本次 P2 快照的单次对照也无明显增长。工作台 CLS 中位数 0.00724，订单和登录为 0。

生产包 **863,288 bytes**，较 P2 增长 **0.31%**、较原始基线增长 **2.30%**，满足 +10% 门槛。

**粒子页性能暂未通过原基线门槛：** 最终评分 87 / 91 / 88，中位数比原基线下降 8 分，FCP 增长 21.62%，超出 -5 分 / +20% 条件；TBT 和 CLS 为 0，动画回调中位数约 59.996fps，与原基线一致。P3 未修改粒子文档或数据，产物 SHA-256 与 P2 一致。追加对照结果保留在机器报告中；不能据此宣称全系统性能验收通过，也不直接推断为组件迁移造成的回归。

追加测量 P2 副本同一粒子文档，评分为 91 / 93 / 96，中位数 93。相同文件在当前环境中也有波动；P3 中位数相对这组对照低 5 分。仍按原基线报告未通过，保留全部样本，不以文件相同或某一次高分替代性能验收。

Lighthouse 自动检查和键盘验证不覆盖真实屏幕阅读器、线上 API 时延或完整业务端到端流程。页面截图包括空数据及一条合成记录，不代表所有长文本和状态组合均完成视觉验收。根路径 iframe 的 Lighthouse NO_FCP 限制仍然适用，粒子内容单独测量。

## 本地复现

```powershell
# 仓库根目录；先在 frontend 执行 npm.cmd run build
node frontend/scripts/serve-design-system-fixtures.mjs
# http://127.0.0.1:4186/dashboard?fixture=empty
# http://127.0.0.1:4186/dashboard?fixture=populated
# http://127.0.0.1:4186/orders?fixture=error
```

该服务只监听 127.0.0.1，使用合成身份和 API 数据，不连接真实后端。`/login?fixture=populated` 接受本地测试输入并返回模拟登录成功；`fixture=empty` 返回模拟登录失败。不要将此服务用于部署。正常开发使用 frontend 的 `npm.cmd run dev`。

```powershell
# frontend 目录
npx.cmd vitest run src/pages/auth/LoginPage.test.tsx src/pages/auth/RegisterPage.test.tsx src/pages/photographer/DashboardPage.test.tsx src/pages/photographer/OrdersPage.test.tsx
npm.cmd run test:ui:coverage
npm.cmd run build
npm.cmd run lint
```

## 后续待办

后续进展：P4 已迁移其余 11 页，本文记录的 10 项旧测试失败已消除，见 [P4 报告](design-system-phase-4.md)。以下真实后端和屏幕阅读器项目仍保留。

- 真实后端登录/注册、预约创建与确认、上传/选片/交付的完整端到端回归。
- 使用实际屏幕阅读器验收错误、加载和焦点播报。
- 其余页面的 10 项旧测试断言与可访问性迁移。
