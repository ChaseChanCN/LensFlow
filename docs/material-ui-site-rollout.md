# Material UI 全站推广

2026-10-16 · `design-system` · **用户已确认试点，全站 UI 已覆盖；完整系统签收仍有待测项。**

## 本轮实现

- 将应用级 MaterialScope 作为唯一主题来源；嵌套布局复用主题，不重复建立作用域。深浅主题、持久化及跨标签同步覆盖全部路由。
- 统一业务导航、订单子路由高亮、页标题、卡片、分组表单、列表、按钮和页脚。Modal / Toast 的 Portal 同步主题。
- 注册页、404 与首页使用公共品牌布局；首页 hero 复用原人物粒子渲染器，画布全幅、肖像按 hero 全高适配、文字叠放并使用全高渐隐遮罩。浅色按最新要求保持白脸黑色暗部、不反相并增强对比，原图边缘逐渐羽化。详见 [人物粒子融合](home-particle-portrait.md)。
- 所有卡片使用鼠标实心柔光：半径 20px、blur 6px，深色银白、浅色浅银蓝；支持列表卡片、通用 Card 与 Portal 中的卡片。移动帧合并更新 CSS 变量，不触发 React 重渲染，淡出后释放节点引用。
- Beam 保留 mono、每次挂载随机形态、强度 0.7。浅色与暗色共用渲染参数，仅对装饰层染为浅银蓝；没有额外底边或遮罩。控制台两项统计继续独立按有效数量启停。
- 登录、预约确认与表单提交使用单层 Beam。Metal 仅用于首页品牌入口及交付下载，各页最多一个，挂载随机材质、强度固定 0.7。一个操作不叠加 Beam 与 Metal。
- 摄影师及客户首页快捷操作沿用直接可见的 Gooey 操作组；AI 分析继续使用真实状态驱动的 Orb，常规请求保持普通加载反馈。

## 页面覆盖

| 页面 | 路由 | 主效果/结构 |
|---|---|---|
| 首页 | `/`（`/landing` 重定向） | 公共品牌布局、Metal 入口、流程卡片 |
| 登录 | `/login` | 已确认的登录面板、单层 Beam |
| 注册 | `/register` | 品牌叙事、带可见标签的表单、Beam 提交 |
| 404 | `/404`（未知路由重定向） | 公共导航、主题、返回入口 |
| 摄影师工作台 | `/dashboard` | 条件 Beam、Gooey、预约列表 |
| 订单列表 | `/orders` | Material 标题及订单卡片 |
| 订单详情 | `/orders/:id` | 分组信息、单层 Beam 状态操作、操作记录 |
| 上传 | `/orders/:id/upload` | 上传卡片、素材列表、Beam 分析入口 |
| AI 分析 | `/orders/:id/analysis` | Beam 概要、Orb、指标与复核卡片 |
| 修图协作 | `/orders/:id/retouch` | 版本/反馈分组、Beam 最终确认 |
| 客户首页 | `/client` | Gooey 直达操作、预约和订单卡片 |
| 新建预约 | `/booking` | 分组表单、可见标签、Beam 提交 |
| 预约详情 | `/bookings/:id` | 详情/编辑、Beam 确认与保存 |
| 选片 | `/orders/:id/selection` | 选片卡片、选择语义、Beam 提交 |
| 交付 | `/orders/:id/delivery` | 文件信息、Metal 下载、上传与归档 |

## 已完成检查

| 项目 | 结果与范围 |
|---|---|
| 类型与构建 | 业务和独立预览构建通过 |
| 前端回归 | 155/155；注册键盘检查更新为新增公共导航后的完整顺序 |
| Lint | 0 错误，2 条原有 DarkroomVideoBackground 警告 |
| 响应式与主题 | 15 页 × 375/768/1280px × 深浅主题 = 90 组；未见横向溢出，各页仅一个主题作用域 |
| 文字对比 | 32 组主题文字/背景 ≥4.5:1，最低约 5.09:1；不包含 Shader 的瞬时像素 |
| 数据反馈 | 浏览器核对七页空状态及订单错误重试；其余请求/交互由组件回归覆盖 |
| 浏览器环境 | Windows 上 Codex 内置浏览器；视觉检查使用隔离合成数据，不发送客户数据 |
| 体积 | 完整清单见机器结果；与早前 Material 试点对比只作历史参照，不充当紧邻版本性能门禁 |

证据：[汇总](site-rollout-results.json)、[90 组布局](site-rollout-browser.json)、[状态](site-rollout-states.json)、[对比度](site-rollout-contrast.json)、[构建体积](site-rollout-bundle.json)。

截图：[深色首页](design-system-screenshots/site-home-dark.png)、[浅色首页](design-system-screenshots/site-home-light.png)、[订单](design-system-screenshots/site-orders-dark.png)、[客户手机页](design-system-screenshots/site-client-mobile-dark.png)、[客户浅色页](design-system-screenshots/site-client-light.png)、[注册手机页](design-system-screenshots/site-register-mobile-dark.png)。

## 验收边界及后续签收项

本轮完成全站视觉与交互推广。以下仍按 [原验收计划](libraries-effects-design-plan.md) 保留，不据此宣称完整系统已通过验收：

- 真实 Safari/iOS、Firefox/Edge 跨浏览器检查和 NVDA/实机读屏。
- 全站更新后的三次交替性能采样、真实 WebGL2 禁用/上下文丢失及 20 次路由切换资源计数。
- Shader 全状态的视觉复核、实际触屏与键盘人工签收。
- 真实业务链与角色隔离：本轮未改后端，原 P5 两项所有权失败及业务链断点仍以 [P5 报告](design-system-phase-5.md) 为准；合成数据检查不等同真实业务验收。

代码未提交或推送；保留原工作树已有改动。本轮未更改依赖版本、API 契约、角色权限或订单状态机。
