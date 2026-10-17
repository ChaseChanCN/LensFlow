# Phase 4 剩余页面迁移

日期：2026-10-16；分支：`design-system`。

## 迁移范围

| 页面 | 主要改动 |
| --- | --- |
| RegisterPage | grouped 输入与下拉框、姓名/邮箱/密码/账号类型命名、autocomplete、错误说明关联、Button loading、main 地标 |
| BookingPage | grouped 表单、持久日期标签、字段名称、提交 loading、成功 status；保留 1.5 秒返回逻辑并在卸载时清理计时器 |
| BookingDetailPage | 查询加载/失败/重试；编辑改为原生 form，支持 Enter、必填/最小时长校验；保存/取消预约/确认预约的 pending 防重复操作 |
| OrderDetailPage | 订单和操作记录独立处理加载/失败/空记录；状态操作的 disabled、aria-busy 与 Spinner |
| UploadPage | 查询状态、EmptyState、命名文件输入、上传/删除 pending；显示实际捕获的上传错误，去除强制颜色覆盖 |
| AnalysisResultPage | 照片/单项分析各自的查询状态；失败不再一直显示“分析中”；复核按钮 loading，保留 keep/exclude/pending API 值 |
| ClientPage | 预约/订单各自的加载/失败/空状态；Link/navigate；预约详情链接与取消按钮分开，移除嵌套按钮 |
| SelectionPage | 空选片集/失败状态；原生切换按钮 aria-pressed；选择计数播报、上限反馈、提交时冻结选择、reduced-motion |
| DeliveryPage | 区分暂无交付（404）和请求失败；上传/归档 pending；下载使用原生链接，移除链接内嵌按钮 |
| RetouchPage | 任务/版本/反馈独立查询状态；上传/反馈/确认 pending；反馈框命名，空反馈不提交 |
| NotFoundPage | main/h1 地标、display 令牌、可访问的返回首页链接 |

共享调整：新增 `LoadingState` / `ErrorState`，交互 ListItem 支持原生 disabled；右侧长文字限制宽度并换行。tinted Button 改用不透明 `info-bg` / `info-label`，修复灰色背景上混色后只有 4.3:1 的对比度。应用入口声明 `zh-CN` 和 LensFlow 标题。

本阶段没有修改 API 模块、订单状态迁移表或增加照片浏览业务。订单状态常量抽离、Ant Design 移除等仍属于独立技术债务。品牌落地页和粒子文档保留原实现。

## 自动检查

- 全量前端测试 **124/124 通过**，P3 记录的 10 项旧失败均已消除。
- 其中专门的 P4 迁移套件 **24/24**，UI 组件套件 **48/48**。修复旧标题/标签断言的同时，增加了实际操作、API 参数、失效查询、pending 和失败重试测试。
- P2 核心组件与 P4 PageState 的覆盖率：行 **100%**、语句 **97.72%**、函数 **98.38%**、分支 **94.93%**。此覆盖范围不等于业务页面覆盖率。
- TypeScript 与生产构建通过；ESLint 无错误，保留 DarkroomVideoBackground 的 2 项既有警告。
- 115 个主题变量 / 121 个工具类候选编译、12 组推荐文字对比度和粒子 reduced-motion 检查通过。

逐页 Lighthouse 自动无障碍结果与代表页面性能测量见 [P4 机器结果](design-system-phase-4-results.json)。原始报告保留在本地忽略目录 `.agentwork/design-system/p4-final-audits/` 与 `p4-performance/`；修复前的检查也保留，未覆盖历史阶段报告。

最终 **13 个自动无障碍检查均为 100 分，未通过的自动审计项为 0**：覆盖 11 页的有数据状态，以及摄影师修图、待上传交付两个角色/状态。此结果不代表真实屏幕阅读器或所有异步状态已验收。

## 性能与体积

| 代表页面 | 性能中位数 | FCP / LCP 中位数 | LCP 相对 P3 快照 |
| --- | --- | --- | --- |
| 注册 | 100 | 606 / 606ms | -2.23% |
| 选片 | 100 | 603 / 645ms | -0.16% |
| 修图协作 | 100 | 605 / 698ms | +0.68% |

三页各测量最终生产构建 3 次，与各 1 次 P3 快照对照；最终 TBT、CLS 中位数均为 0。对照只有一个样本，统计置信度有限；测量使用本地模拟 API，不包含真实服务时延。

生产包 **868,587 bytes**，较 P3 的 863,288 bytes 增长 **0.61%**，较原始基线增长 **2.92%**，满足 +10% 门槛。主 JS 409,907 bytes、主 CSS 33,197 bytes。粒子文档哈希与 P3 相同，本阶段未复测其导航性能；原有性能待办未关闭。

## 浏览器验证

- 11 页均检查 **375 / 768 / 1280px**，共 33 个布局组合，无横向溢出。
- 在模拟 API 下验证预约详情保存与重新读取、选片达到上限后禁用未选项、选片提交返回客户页、修图反馈提交后出现在列表中、JPEG 文件选择上传与删除、注册输入框可见键盘焦点。
- 迁移前 ClientPage 的嵌套按钮、DeliveryPage 的链接内嵌按钮均已移除。
- 已保存 11 页的迁移前/后及手机截图；预期视觉变化为统一空状态、字号/行高语义化、深色文字、tinted 背景、日期标签与 404 标题。不能将这些改动描述为逐像素一致。

| 页面 | 迁移前 | 迁移后 | 手机 |
| --- | --- | --- | --- |
| 注册 | [截图](design-system-screenshots/phase-4-register-before.jpg) | [截图](design-system-screenshots/phase-4-register-after.jpg) | [截图](design-system-screenshots/phase-4-register-mobile.jpg) |
| 预约表单 | [截图](design-system-screenshots/phase-4-booking-before.jpg) | [截图](design-system-screenshots/phase-4-booking-after.jpg) | [截图](design-system-screenshots/phase-4-booking-mobile.jpg) |
| 预约详情 | [截图](design-system-screenshots/phase-4-booking-detail-before.jpg) | [截图](design-system-screenshots/phase-4-booking-detail-after.jpg) | [截图](design-system-screenshots/phase-4-booking-detail-mobile.jpg) |
| 订单详情 | [截图](design-system-screenshots/phase-4-order-detail-before.jpg) | [截图](design-system-screenshots/phase-4-order-detail-after.jpg) | [截图](design-system-screenshots/phase-4-order-detail-mobile.jpg) |
| 上传 | [截图](design-system-screenshots/phase-4-upload-before.jpg) | [截图](design-system-screenshots/phase-4-upload-after.jpg) | [截图](design-system-screenshots/phase-4-upload-mobile.jpg) |
| 分析 | [截图](design-system-screenshots/phase-4-analysis-before.jpg) | [截图](design-system-screenshots/phase-4-analysis-after.jpg) | [截图](design-system-screenshots/phase-4-analysis-mobile.jpg) |
| 客户首页 | [截图](design-system-screenshots/phase-4-client-before.jpg) | [截图](design-system-screenshots/phase-4-client-after.jpg) | [截图](design-system-screenshots/phase-4-client-mobile.jpg) |
| 选片 | [截图](design-system-screenshots/phase-4-selection-before.jpg) | [截图](design-system-screenshots/phase-4-selection-after.jpg) | [截图](design-system-screenshots/phase-4-selection-mobile.jpg) |
| 交付 | [截图](design-system-screenshots/phase-4-delivery-before.jpg) | [截图](design-system-screenshots/phase-4-delivery-after.jpg) | [截图](design-system-screenshots/phase-4-delivery-mobile.jpg) |
| 修图 | [截图](design-system-screenshots/phase-4-retouch-before.jpg) | [截图](design-system-screenshots/phase-4-retouch-after.jpg) | [截图](design-system-screenshots/phase-4-retouch-mobile.jpg) |
| 404 | [截图](design-system-screenshots/phase-4-not-found-before.jpg) | [截图](design-system-screenshots/phase-4-not-found-after.jpg) | [截图](design-system-screenshots/phase-4-not-found-mobile.jpg) |

## 复现

```powershell
# frontend 目录
npm.cmd run build
npm.cmd run test:ui:coverage
npx.cmd vitest run
npm.cmd run lint

# 仓库根目录
node frontend/scripts/serve-phase-4-fixtures.mjs
```

模拟服务只监听 127.0.0.1，当前构建端口 4196，P4 前快照（存在时）端口 4195。数据在内存中，不访问真实后端；页面带 `fixture` 参数重新打开会重置该模拟会话。

- [客户首页](http://127.0.0.1:4196/client?fixture=populated&role=client)
- [选片](http://127.0.0.1:4196/orders/1/selection?fixture=populated&role=client)
- [摄影师修图](http://127.0.0.1:4196/orders/1/retouch?fixture=populated&role=photographer)
- [待上传交付](http://127.0.0.1:4196/orders/1/delivery?fixture=empty&role=photographer&status=WAITING_DELIVERY)
- [模拟请求失败](http://127.0.0.1:4196/client?fixture=error&role=client)

## 迁移模式

```tsx
<Input variant="grouped" name="email" aria-label="邮箱" autoComplete="email" />
<Button type="submit" loading={saving}>保存</Button>
{query.isLoading ? <LoadingState label="正在加载照片" />
  : query.isError ? <ErrorState title="照片加载失败" onRetry={() => { void query.refetch() }} />
  : query.data.length === 0 ? <EmptyState title="暂无照片" />
  : <PhotoList photos={query.data} />}
```

优先保留原生语义：表单用 form/submit，页面导航用 Link，下载用 a；不要将按钮嵌入按钮或链接。涉及多个资源时分别呈现失败状态，避免把网络错误显示为空数据。按钮名称保持稳定，用 loading/aria-busy 表达忙碌。自定义选片卡片保留可见文字作为名称，通过 aria-pressed 表达选中。

## 留给 Phase 5

- 真实后端的权限、登录注册、预约确认、上传、选片、反馈及下载完整回归。
- 实际屏幕阅读器、错误播报、长内容、更多数据规模和全部状态组合验收。
- P3 粒子文档的性能门槛仍未通过；P4 未修改粒子文件，不以此宣称其性能已恢复。
- 全系统视觉、动效和性能复核。
