# Design Tokens 使用指南

令牌定义：`frontend/src/index.css`。当前处于 Phase 1；页面迁移与组件增强在后续阶段进行。

## Tailwind v4 与 CSS 变量

`@theme static` 定义工具类所使用的令牌，同时保留未被工具类引用的变量，让组件直接调用 `var()` 也能取到值。工具类仍然按源码中的实际使用情况生成；`npm.cmd run check:tokens` 单独验证全部声明对应的候选类可编译。

| 职责 | Tailwind 命名空间 | 示例 |
|---|---|---|
| 颜色 | `--color-*` | `bg-brand-primary`、`text-action-primary-strong` |
| 字体与字重 | `--font-*`、`--font-weight-*` | `font-mono`、`font-regular` |
| 字号与行高 | `--text-*`、`--leading-*` | `text-heading-lg`、`text-form-label`、`leading-normal` |
| 间距 | `--spacing-*` | `p-4`、`gap-6`、`m-8` |
| 内容宽度 | `--container-content-*` | `max-w-content-lg` |
| 断点 | `--breakpoint-*` | `md:grid-cols-2` |
| 圆角 | `--radius-*` | `rounded-control`、`rounded-card` |
| 已有阴影工具类 | `--shadow-card/elevated/focused` | `shadow-card`、`hover:shadow-elevated` |

计划中的 `--space-*`、`--line-height-*`、`--width-content-*` 是 `:root` 中的 CSS 别名。它们可供 `var()` 使用；Tailwind 工具类使用上表中的正式命名空间。断点采用 `rem`，与 Tailwind 默认断点单位一致；在默认 16px 根字号下，`md:48rem` 对应 768px。参见 [Tailwind theme namespaces](https://tailwindcss.com/docs/theme)。

字号中的表单标签命名为 `--text-form-label`，对应 `text-form-label`，避免与原有的 `text-label` 文字颜色工具类冲突。原方案中的 `var(--text-label)` 保留为 CSS 别名。

新增的动效、边框宽度、层级与阴影位于 `:root`，通过 `var()` 使用。已有页面依赖的三个阴影工具类保留在 `@theme`，确保兼容。

```css
.dialog {
  box-shadow: var(--shadow-modal);
  z-index: var(--z-modal);
  transition: opacity var(--duration-base) var(--ease-out);
  padding: var(--space-6);
}
```

## 品牌、场景与文字颜色

品牌装饰使用 `brand-primary`（粒子蓝灰 `#6B7A99`）；交互使用 `action-primary`（iOS 蓝 `#007AFF`）。原有 `accent`、`system-bg`、`system-fill` 令牌仍可使用，数值保持兼容。

| 场景 | 背景 | 主要文字 |
|---|---|---|
| 业务工作区 | `surface-secondary` 页面底色，`surface-primary` 卡片 | `label` |
| 品牌展示 | `surface-dark-primary` 或 `brand-darkroom` | `label-inverse` |
| 照片浏览 | `surface-neutral` | `label` |

普通文字需要至少 4.5:1 的对比度。蓝色和品牌色原值作为白色普通文字的背景时，分别只有 **4.02:1** 和 **4.31:1**；原方案中的估算值已通过 WCAG 相对亮度公式重新计算。普通字号的白字按钮可使用 `action-primary-strong`（`#0066D6`，5.42:1）。状态标签的文字使用 `success-label`、`warning-label`、`error-label`、`info-label`，搭配对应的 `*-bg`；这些组合均达到 4.5:1。参见 [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。

```tsx
<section className="rounded-card bg-surface-primary p-4 text-label shadow-card">
  <h2 className="text-heading-md font-semibold leading-tight">订单概览</h2>
  <span className="rounded-full bg-success-bg px-3 py-1 text-caption text-success-label">
    已完成
  </span>
  <button className="rounded-control bg-action-primary-strong px-4 py-3 text-label-inverse">
    查看订单
  </button>
</section>
```

以上新增文字令牌用于后续组件迁移。当前页面仍使用原有颜色，不能以令牌检查通过替代页面无障碍验收。透明文字颜色还必须结合实际背景计算；`label-tertiary` 等浅色不适合承载必读信息。

## Reduced motion

全局 CSS 在 `prefers-reduced-motion: reduce` 下缩短 UI 动画及过渡，将 CSS 平滑滚动设为 `auto`。粒子页位于独立 iframe，已单独添加相同的 CSS 规则。现有页面中显式调用 `scrollIntoView({ behavior: 'smooth' })` 的交互仍需在页面迁移阶段按偏好处理。

Three.js 动画通过 `matchMedia` 读取偏好：开启时取消待执行帧、冻结 shader 时间并绘制静态场景；恢复普通偏好时重新启动一个动画循环。静态场景在窗口尺寸变化后重新绘制，避免 `setSize` 清空画布。动画调度检查不依赖 GPU；最终设备上的视觉与帧率仍需结合性能报告判断。

## 验证命令

在 `frontend/` 下执行：

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run check:tokens
npm.cmd run check:contrast
npm.cmd run check:motion
npm.cmd exec -- vitest run
```

`check:tokens` 使用 `@tailwindcss/vite` 安装的同版本 `@tailwindcss/node` 编译器；包含旧阴影工具类及不使用工具类时的 CSS 变量检查。`check:contrast` 校验推荐普通文字组合。`check:motion` 执行粒子页面中的真实动画调度和 resize 方法，检查暂停、恢复与重复偏好事件。
