# Design System 性能基线与 Phase 1 验证

测量日期：2026-10-16（Asia/Shanghai）。分支：`design-system`。

原始基线在 Phase 1 修改前采集。补测时在临时目录恢复修改前的样式、ListItem、页面导入、粒子页面及前端环境配置，同时保留工作区原有的落地页等改动；恢复后主 CSS、主 JS 文件名和 `dist/` 总体积与最初记录一致。

完整数据、逐次测量、资源 SHA-256 与测试失败清单见 [机器可读结果](design-system-performance-results.json)。令牌说明见 [使用指南](design-tokens.md)。

## 测量环境与方法

- Windows build 26200，Intel i7-1185G7，8 个逻辑处理器，约 16 GiB 内存。
- Node 24.20.0，Vite 8.3.4，Edge 155.0.4283.45，Lighthouse 13.5.0。
- 生产静态产物；Lighthouse desktop preset，1350 × 940，DPR 1；模拟网络 RTT 40ms、吞吐量 10240 Kbps，CPU 倍率 1。
- 每个版本、每个可测页面独立运行 3 次，取中位数；冷浏览器配置，测试按顺序执行。
- 仪表盘采用本地摄影师身份和空预约/订单夹具。测量服务将两个版本的 API 地址统一到同源夹具；源文件和生产 `dist/` 不作此改写。这些结果只比较前端渲染，不代表真实登录与后端请求耗时。

首次补测曾遗漏隔离副本的 API 环境配置，导致仪表盘请求来源不同；那批结果已排除。后续补齐 `.env` 并统一夹具后重新测量。

## 构建产物

| 指标 | 修改前 | Phase 1 当前 | 变化 |
|---|---:|---:|---:|
| `dist/` 总体积，8 个文件 | 843,904 bytes | 849,133 bytes | +5,229 bytes（+0.62%） |
| 主 CSS | 25,578 bytes | 29,456 bytes | +3,878 bytes |
| 主 CSS gzip | 5,346 bytes | 6,418 bytes | +1,072 bytes |
| 主 JS | 394,197 bytes | 394,197 bytes | 不变，SHA-256 相同 |
| 主 JS gzip | 119,885 bytes | 119,885 bytes | 不变 |

以上 gzip 由 `measure-bundle.mjs` 使用 Node zlib level 6 统一离线计算，与 Vite 控制台摘要的压缩估算可能略有差异，不代表测量服务器实际启用 gzip。主 JS 与原始基线字节一致；ListItem 构建修复最终只修改类型声明。

总产物增长低于计划的 +10% 目标。新增 CSS 包含完整可供 `var()` 调用的静态主题变量。

## Lighthouse 中位数

| 页面 | 性能评分，前 → 后 | FCP，前 → 后 | LCP，前 → 后 |
|---|---|---|---|
| 粒子文档 `/lensflow-v24.html` | 96 → 96 | 993 → 1056 ms（+6.39%） | 1086 → 1125 ms（+3.57%） |
| 登录页 `/login` | 100 → 100 | 565 → 566 ms（+0.17%） | 605 → 605 ms（约不变） |
| 仪表盘 `/dashboard`，空数据夹具 | 100 → 100 | 565 → 563 ms（−0.36%） | 654 → 654 ms（约不变） |

上述测量满足性能评分不低于基线 −5 分、FCP/LCP 增长不超过 +20% 的相对目标。所有测量页面的 TBT、CLS 中位数均为 0。

首页 `/` 是 iframe 包装，在本机 Lighthouse 中返回 `NO_FCP`，无法给出有效性能评分、FCP 或 LCP；不将缺测记为 0 分。粒子文档的单独测量不能替代首页整体路由验收。

## 动画与视觉检查

Three.js 粒子文档的 trace 在跳过首 500ms 后，以主渲染线程 `FireAnimationFrame` 回调计算帧率；每次稳定采样约 1.9 秒。修改前、后中位数分别为 **59.994、59.996 callbacks/s**，满足不下降 10fps 的采样目标。这是 headless 回调节奏，不能等同真实设备 GPU 的持续呈现帧率。

使用 Edge `--force-prefers-reduced-motion` 复测粒子文档，画面正常显示静态粒子，trace 中持续动画回调为 **0**。`check:motion` 另外覆盖偏好恢复、重复事件、shader 时间冻结，以及窗口 resize 后静态画布重绘。

登录页与仪表盘的 Lighthouse 最终截图在修改前后字节相同。截图已保存为 [登录页修改前](design-system-screenshots/login-before.jpg)、[修改后](design-system-screenshots/login-after.jpg)，以及 [仪表盘修改前](design-system-screenshots/dashboard-before.jpg)、[修改后](design-system-screenshots/dashboard-after.jpg)。这些是缩小后的 Lighthouse 截图；完整分辨率、移动端和首页动态画面的视觉验收仍待执行。

## 构建与回归状态

| 检查 | 结果 |
|---|---|
| TypeScript + 生产构建 `npm.cmd run build` | 通过 |
| Lint | 0 错误；已有 DarkroomVideoBackground 的 2 条 effect 警告 |
| `check:tokens` | 114 个主题变量、118 个工具类候选；验证具体属性、旧阴影类和未使用令牌保留 |
| `check:contrast` | 9 组推荐普通文字组合均达到 4.5:1 |
| `check:motion` | 暂停、恢复、重复偏好、shader 冻结、静态 resize 均通过 |
| ListItem 新增回归测试 | 3/3 通过；React 标题内容、按钮不提交表单、键盘操作 |
| 全量前端测试 | 修改前 16/30 通过、14 失败；修改后 19/33 通过、同样 14 失败；无新增失败 |

最初阻塞构建的 ListItem `title` 与 DOM 属性冲突、div/button 事件属性类型问题已修复；OrderDetailPage 和 OrdersPage 的两个未使用导入已移除。

已有失败集中于 Login、Booking、Orders、Upload、AnalysisResult、Retouch、Selection、Delivery 页的旧文本/标签查询和测试夹具。它们已在修改前副本中复现，不标记为本次新增回归，也不将全量测试标记为通过。

页面无障碍仍有存量问题：Lighthouse accessibility 中位数为登录页 89、仪表盘 91，修改前后相同。新令牌提供普通文字可用的深色操作色与状态文字色；现有组件尚未迁移，所以不能宣布全站 WCAG AA 通过。

## 重复检查

在 `frontend/` 下执行：

```powershell
npm.cmd run build
npm.cmd run measure:bundle
npm.cmd run check:tokens
npm.cmd run check:contrast
npm.cmd run check:motion
npm.cmd exec -- vitest run
```

原始 Lighthouse 报告和 traces 位于本地忽略目录 `.agentwork/design-system/`，有效登录/仪表盘报告在 `lighthouse-final/`，粒子文档报告在 `lighthouse/`，减少动态效果报告为 `reduced-motion.json`。临时测量服务只监听 `127.0.0.1`；复测时保持上述设备、视口、网络预设和夹具一致。

## 后续阶段记录

本文保留 Phase 1 的历史结论。Phase 2 的组件与包体积结果见 [P2 结果](design-system-phase-2-results.json)；Phase 3 的页面迁移、更新后的测试与自动无障碍检查见 [P3 报告](design-system-phase-3.md) 和 [P3 机器结果](design-system-phase-3-results.json)。

Phase 4 的其余页面迁移、旧测试修复及包体积见 [P4 报告](design-system-phase-4.md) 与 [P4 机器结果](design-system-phase-4-results.json)。P3 粒子页导航性能的待办继续保留到 Phase 5。
