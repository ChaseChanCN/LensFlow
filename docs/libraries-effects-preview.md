# Libraries.dev · 独立预览交付记录

日期：2026-10-16 · 状态：**用户已确认视觉方向，已进入三页试点**。最新随机规则、固定强度、加号修复与验收结果见 [试点报告](libraries-effects-pilot.md)。以下为初始预览交付记录。

- [设计与分阶段验收计划](libraries-effects-design-plan.md)
- 本地预览：[Material Studies](http://127.0.0.1:5177/effects-preview.html)
- [深色预览截图](design-system-screenshots/effects-preview-dark.png)
- [浅色移动截图](design-system-screenshots/effects-preview-mobile-light.png)

## 本轮交付

四个库均已安装并由独立入口真实渲染。可切换深浅主题、Beam 形态与配色、九种 Orb 状态/两种尺寸、三种 Metal 材质，以及共用强度、暂停和减少动态效果。Gooey 支持展开、选择、Escape 返回触发按钮；静态模式显示三个普通操作按钮。

当前安装的 `thinking-orbs@0.3.2` 使用 `theme="light|dark"`，按安装包 TypeScript 定义接入。预览使用 MetalFx v2；MetalText/MetalBadge 等扩展功能留待确认具体场景后评估。

预览操作只显示本地反馈，Orb 状态均明确标注模拟。登录、分析及仪表盘业务页面尚未接入这些效果。

## 已执行检查

| 检查 | 结果 |
|---|---|
| 类型与独立预览生产构建 | 通过，`npm.cmd run build:effects` |
| 业务应用生产构建 | 通过，`npm.cmd run build`；JS/CSS 产物名称及哈希与 P5 保持一致 |
| Lint | 0 错误，只有原有 DarkroomVideoBackground 的 2 条警告 |
| 375/768/1440px × 深/浅色 | 6 个组合无横向溢出；桌面与移动截图留档 |
| Gooey | 展开、选择操作、Escape 收起及焦点返回已检查 |
| Metal | 按钮反馈、画布挂载已检查；完整 WebGL 降级验收尚待试点 |
| 参数控制 | Orb weaving/solving、20/64、强度 0.5/0.7 切换已检查 |
| 暂停/减少动态效果控制 | 静态模式标记与三个静态操作可用已检查；尚未做 trace 级 RAF/后台资源验收 |

独立预览 JS 约 478.07KB / gzip 140.92KB，包含 React 与四个库，不是单个效果或业务首屏增量。预览 CSS 约 44.25KB / gzip 9.51KB。试点前还需按路由拆分并测量实际增量，不能将预览体积当成性能预算已通过。

本轮未重复执行 P5 的全量前后端测试。全量回归、真实读屏、Safari/iOS、WebGL 禁用与上下文丢失、重复卸载稳定性、三次配对性能测量按计划在试点与全站验收阶段执行。原 P5 的权限和业务阻断继续保留。

## 运行方式

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5177
# 独立预览构建（输出在仓库忽略目录）
npm.cmd run build:effects
```

方案确认后，先在 LoginPage、AI 分析区域与 DashboardPage 试点，提交对比和验收结果；确认试点后再全站迁移。
