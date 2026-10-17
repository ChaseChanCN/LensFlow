# 卡片鼠标柔光

当前形态为以鼠标为圆心、半径 20px 的实心渐变光斑，叠加 6px 高斯模糊；移出后 160ms 淡出。暗色使用银白，浅色使用浅银蓝。减少动态效果偏好下取消淡出过渡，触屏不显示。

监听位于应用层，覆盖通用 Card、ListGroup、rounded-card 容器及材质试点卡片；独立预览使用同一实现。嵌套卡片只响应鼠标当前所在的最近卡片。光层不接收指针事件，保持按钮和链接可用。

实现：`frontend/src/components/effects/useCardCursorGlow.ts` 与 `card-cursor-glow.css`。

2026-10-16：业务与预览构建通过；在控制台待确认预约卡片中查看到 active 状态、20px 实心渐变与 blur(6px)。未新增或运行自动测试。

截图：`design-system-screenshots/cursor-glow-solid-booking-dark.png`。
