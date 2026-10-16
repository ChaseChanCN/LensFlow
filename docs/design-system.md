# LensFlow 设计系统

分支：`design-system`。Phase 1–4 实现已落地；Phase 5 验收已执行，**全系统门禁尚未通过**。

## 使用入口

- [完整 Material UI 三页试点与全站推广安排](material-ui-pilot.md)（等待视觉确认）
- [Libraries.dev 交互效果方案与验收计划](libraries-effects-design-plan.md) / [三页试点及验收记录](libraries-effects-pilot.md)（预览已确认；试点未全签收）
- [Design Tokens：颜色、排版、间距、动效与映射](design-tokens.md)
- [组件 API、状态、键盘交互与迁移指南](design-system-components.md)
- 开发组件展示页：启动前端后访问 `/design-system.html`。
- [原始方案与阶段定义](../DESIGN_SYSTEM_PLAN.md)

## 场景规则

品牌首页保留暗房背景、蓝灰粒子和展示排版；认证与业务工作区共享浅色语义令牌、表单和反馈状态；照片处理区使用中性背景，优先保护图像内容。品牌 Canvas、照片选中控件、导航链接与业务卡片按语义保留专门实现，不能为了统一外观替换为错误的控件角色。

普通操作复用 Button；路由使用链接；表单复用 Input/Select/Textarea；状态通过 Badge/PageState 等表达。下载必须通过认证 API 获取 Blob，提供加载和失败反馈。全局 CSS 与粒子脚本分别处理减少动态效果。

## 实施与验收

| 阶段 | 文档 | 状态 |
|---|---|---|
| P1 令牌与基线 | [令牌](design-tokens.md)、[性能基线](design-system-performance-baseline.md)、[结果](design-system-performance-results.json) | 已实施 |
| P2 核心组件 | [组件指南](design-system-components.md)、[结果](design-system-phase-2-results.json) | 已实施 |
| P3 三个试点页 | [报告](design-system-phase-3.md)、[结果](design-system-phase-3-results.json) | 已实施；历史待办见 P5 |
| P4 其余页面 | [报告](design-system-phase-4.md)、[结果](design-system-phase-4-results.json) | 已实施 |
| P5 全系统验收 | [报告与问题清单](design-system-phase-5.md)、[结果](design-system-phase-5-results.json) | NOT_ACCEPTED |

[人工读屏检查表](design-system-accessibility-checklist.md) 尚待执行。P5 的两项后端归属校验、现有 UI 业务链衔接及读屏结果阻止全系统签收；自动测试通过不等同于完整业务流程或全面无障碍通过。
