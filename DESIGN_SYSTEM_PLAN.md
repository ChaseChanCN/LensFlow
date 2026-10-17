# LensFlow 设计系统方案（修订版）

**Material UI 推广（2026-10-16）：** 用户确认试点后已完成 15 类页面的全站视觉与交互覆盖；最新范围、检查证据及未完成签收项见 [全站推广报告](docs/material-ui-site-rollout.md)。原 Phase 5 的业务阻断继续独立跟踪。

**版本：** v1.2  
**修订日期：** 2026-10-16  
**基于审计报告：** tool_142ae946a001JiWFpJHA2x2Min

**实施进展（2026-10-16）：** `design-system` 分支已实施 Phase 1–4，Phase 5 验收已执行但最终门禁未通过。前端 129/129、后端 145/145 测试通过；16 项自动无障碍均 100 分，45 个响应式组合无横向溢出；普通粒子模式性能中位数 97。真实 API 为 38/40，两项客户归属检查失败；现有 UI 业务链与人工读屏仍有待办。参见 [设计系统入口](docs/design-system.md)、[P5 验收及阻断清单](docs/design-system-phase-5.md) 和 [机器结果](docs/design-system-phase-5-results.json)。

---

## 文档说明

本文档基于已完成的《LensFlow 项目 UI/UX 审计报告》进行修订，明确了跨场景设计系统的定义，区分了已验证事实和设计推断，并制定了分阶段、可验收的实施计划。

**重要原则：**
- **不重新扫描项目** - 基于现有审计结果
- **不立即开始编码** - 本文档仅作为设计系统的规划方案
- **所有结论基于真实代码** - 明确标注验证状态
- **分离设计系统工作与业务功能开发**

---

## 1. 设计系统定义与理念

### 1.1 跨场景设计系统定义

LensFlow 的设计系统不是强制所有页面采用完全相同的背景颜色或视觉风格，而是一套**跨场景的 Design System**，确保在不同场景下共享统一的设计语言。

**核心覆盖场景：**
1. **品牌展示层** - 落地页、粒子动画主页
2. **身份认证** - 登录、注册页面
3. **摄影师工作台** - 仪表盘、订单管理、照片上传、AI 分析
4. **客户端** - 预约流程、选片、修图反馈、交付下载
5. **照片浏览与处理** - 图像预览、修图协作、选片界面

### 1.2 设计系统的边界与原则

#### 原则 1: 统一不等于完全相同

**统一的含义：**
- 共享颜色语义系统（成功、警告、错误、主题色）
- 共享排版规范（字体族、字号层级、字重体系）
- 共享间距体系（内外边距、栅格系统）
- 共享控件状态（hover、focus、active、disabled）
- 共享图标风格（线性图标、尺寸规范）
- 共享交互原则（动效时长、缓动曲线、反馈机制）

**允许的差异：**
- **背景颜色** - 品牌展示层可以使用深色暗房风格，业务工作区使用浅色
- **视觉密度** - 展示层可以更具戏剧性，工作区必须优先可读性
- **装饰元素** - 展示层可以有粒子动画，工作区保持简洁

#### 原则 2: 场景优先，保护内容

**品牌展示层（落地页）：**
- 保留现有的黑色暗房背景（`#000000`）
- 保留冷蓝灰粒子动画和编辑式视觉风格
- 允许更大胆的排版和动效
- 目标：建立品牌认知和情感连接

**业务工作区（摄影师/客户端）：**
- 使用适合长时间操作的浅色界面（`#FFFFFF`, `#F2F2F7`）
- 强调可读性和操作效率
- 减少不必要的装饰
- 目标：提升工作效率和用户体验

**图像处理场景（照片浏览、选片、修图）：**
- 优先保护图像内容本身
- 使用中性背景避免色彩干扰
- 不能为了追求视觉一致而增加不必要的装饰
- 目标：准确呈现照片内容，辅助专业决策

#### 原则 3: 渐进式实施，持续验证

- 不一次性重写所有页面
- 先建立设计令牌和核心组件
- 通过单个页面验证设计系统的适用性
- 通过后再逐步迁移其他页面

---

## 2. 设计令牌系统

### 2.1 颜色系统

基于现有 iOS Human Interface Guidelines 色彩系统，结合粒子动画的品牌色调。

#### 品牌颜色

**品牌色职责定义：**

```css
/* 主品牌色 - 粒子蓝灰 (从现有粒子动画提取) */
--color-brand-primary: #6B7A99;
--color-brand-primary-hover: #5A6885;
--color-brand-primary-pressed: #495670;

/* 操作色 - iOS 蓝 (保持现有，用于交互元素) */
--color-action-primary: #007AFF;
--color-action-primary-hover: #0066D6;
--color-action-primary-pressed: #0040A0;

/* 品牌展示层专用 - 深色背景 */
--color-brand-darkroom: #000000;
--color-brand-darkroom-overlay: rgba(0, 0, 0, 0.8);
```

**职责划分：**
- **`brand-primary` (粒子蓝灰 #6B7A99)** - 品牌识别色，用于品牌展示层装饰元素、插图、渐变背景、次要图标
- **`action-primary` (iOS 蓝 #007AFF)** - 操作色，用于主要操作按钮、链接、选中状态、焦点边框
- **`brand-darkroom`** - 仅用于落地页和品牌展示场景背景

**对比度要求（WCAG AA 标准）：**

| 组合 | 对比度要求 | 验证方式 |
|------|-----------|---------|
| 普通文字 (16px+) on 背景 | ≥ 4.5:1 | WebAIM Contrast Checker |
| 大文字 (24px+ 或 18.66px+ bold) on 背景 | ≥ 3:1 | WebAIM Contrast Checker |
| 按钮文字 on 按钮背景 | ≥ 4.5:1 | 实际渲染后检测 |
| 状态标签文字 on 标签背景 | ≥ 4.5:1 | 实际渲染后检测 |

**预期对比度（待验证）：**
- `#007AFF` (action-primary) on `#FFFFFF`: ~3.3:1 (⚠️ 不足，需验证)
- `#1C1C1E` (label) on `#FFFFFF`: ~14.3:1 (✅ 通过)
- `#FFFFFF` (label-inverse) on `#007AFF`: ~3.3:1 (⚠️ 大文字通过，普通文字不足)
- `#FFFFFF` on `#6B7A99`: ~4.2:1 (⚠️ 需验证)

**验证状态：** ⚠️ 待验证 - 在 Phase 1 实施后使用 WebAIM Contrast Checker 和 Lighthouse 检测实际对比度

#### 语义颜色

```css
/* 文本颜色 - iOS Label 层级 (保持现有) */
--color-label: #1C1C1E;                          /* 主要文本 */
--color-label-secondary: rgba(60, 60, 67, 0.6);  /* 次要文本 */
--color-label-tertiary: rgba(60, 60, 67, 0.3);   /* 三级文本 */
--color-label-quaternary: rgba(60, 60, 67, 0.18);/* 四级文本 */

/* 反色文本 - 用于深色背景 (新增) */
--color-label-inverse: #FFFFFF;
--color-label-inverse-secondary: rgba(255, 255, 255, 0.6);
--color-label-inverse-tertiary: rgba(255, 255, 255, 0.3);

/* 状态颜色 (保持现有) */
--color-success: #34C759;
--color-success-bg: #E8F8ED;
--color-success-border: #A3E4B8;

--color-warning: #FF9500;
--color-warning-bg: #FFF4E5;
--color-warning-border: #FFD699;

--color-error: #FF3B30;
--color-error-bg: #FFEBEE;
--color-error-border: #FF9B96;

--color-info: #007AFF;
--color-info-bg: #E5F2FF;
--color-info-border: #99CCFF;
```

**应用场景：**
- 所有场景共享相同的语义颜色职责
- 品牌展示层使用 `label-inverse` 系列
- 业务工作区使用标准 `label` 系列

**验证状态：** ✅ 已检查源码 - `frontend/src/index.css` 中已定义这些令牌

#### 背景颜色 - Surface 层级

```css
/* 浅色场景 - 业务工作区 (保持现有) */
--color-surface-primary: #FFFFFF;      /* 卡片、表单、主要内容区 */
--color-surface-secondary: #F2F2F7;    /* 页面背景 */
--color-surface-tertiary: #FFFFFF;     /* 分组内容背景 */
--color-surface-grouped: #F2F2F7;      /* iOS 风格分组背景 */

/* 深色场景 - 品牌展示层 (新增) */
--color-surface-dark-primary: #000000;
--color-surface-dark-secondary: #1C1C1E;
--color-surface-dark-tertiary: #2C2C2E;

/* 中性场景 - 图像处理区 (新增) */
--color-surface-neutral: #F5F5F5;      /* 照片背景 */
--color-surface-neutral-dark: #E0E0E0; /* 照片边框 */
```

**应用场景：**
- 业务工作区：所有页面使用 `surface-primary/secondary`
- 品牌展示层：落地页使用 `surface-dark-*`
- 图像处理：照片浏览、选片使用 `surface-neutral`

**验证状态：** ✅ 已检查源码 - `frontend/src/index.css` 中部分已定义，深色和中性场景令牌需在 Phase 1 新增

#### 填充颜色

```css
/* 半透明填充 - iOS System Fill (保持现有) */
--color-fill-primary: rgba(120, 120, 128, 0.2);
--color-fill-secondary: rgba(120, 120, 128, 0.16);
--color-fill-tertiary: rgba(120, 120, 128, 0.12);
--color-fill-quaternary: rgba(120, 120, 128, 0.08);

/* 深色场景填充 (新增) */
--color-fill-dark-primary: rgba(255, 255, 255, 0.1);
--color-fill-dark-secondary: rgba(255, 255, 255, 0.08);
--color-fill-dark-tertiary: rgba(255, 255, 255, 0.05);
```

#### 分隔线和边框

```css
/* 分隔线 (保持现有) */
--color-separator: rgba(60, 60, 67, 0.29);
--color-separator-opaque: #C6C6C8;

/* 深色场景分隔线 (新增) */
--color-separator-dark: rgba(255, 255, 255, 0.15);
--color-separator-dark-opaque: #3A3A3C;

/* 焦点边框 */
--color-focus-ring: rgba(0, 122, 255, 0.25);
```

### 2.2 排版系统

#### 字体族

```css
/* 无衬线字体 - 主要字体 */
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", 
             system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, 
             sans-serif;

/* 等宽字体 - 代码、编号 (新增) */
--font-mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 
             "Liberation Mono", "Courier New", monospace;

/* 数字字体 - 用于数据展示 (新增) */
--font-numeric: "SF Pro Display", -apple-system, sans-serif;
```

#### 字号层级

```css
/* Display - 品牌展示层超大标题 */
--text-display-xl: 64px;  /* 落地页主标题（桌面端） */
--text-display-lg: 48px;  /* 落地页主标题（移动端） */

/* Heading - 页面标题层级 */
--text-heading-xl: 36px;  /* 页面主标题 */
--text-heading-lg: 30px;  /* 大型标题（LargeTitle 组件） */
--text-heading-md: 24px;  /* 区段标题 */
--text-heading-sm: 20px;  /* 小型标题 */

/* Body - 正文层级 */
--text-body-lg: 18px;     /* 大号正文 */
--text-body: 16px;        /* 标准正文 */
--text-body-sm: 14px;     /* 小号正文 */

/* Support - 辅助文本 */
--text-caption: 12px;     /* 说明文字、标签 */
--text-label: 14px;       /* 表单标签 */

/* Numeric - 数据展示 */
--text-numeric-lg: 32px;  /* 统计数字 */
--text-numeric: 24px;     /* 普通数据 */
```

**验证状态：** ✅ 已检查源码 - 当前代码使用 `text-4xl`(36px)、`text-3xl`(30px)、`text-7xl`(72px)，需规范为语义化令牌
**注意：** 源码使用这些字号不代表设计决策合理，仅表示当前实现状态

#### 字重

```css
--font-weight-regular: 400;   /* 正文 */
--font-weight-medium: 500;    /* 次要标题 */
--font-weight-semibold: 600;  /* 主要标题 */
--font-weight-bold: 700;      /* 强调标题 */
```

#### 行高

```css
--line-height-tight: 1.25;    /* 大标题 */
--line-height-normal: 1.5;    /* 正文 */
--line-height-relaxed: 1.75;  /* 长文本 */
```

### 2.3 空间系统

#### 间距令牌

```css
/* 微小间距 */
--space-1: 4px;   /* 0.25rem */
--space-2: 8px;   /* 0.5rem */
--space-3: 12px;  /* 0.75rem */
--space-4: 16px;  /* 1rem */

/* 常规间距 */
--space-5: 20px;  /* 1.25rem */
--space-6: 24px;  /* 1.5rem */
--space-8: 32px;  /* 2rem */
--space-10: 40px; /* 2.5rem */

/* 大型间距 */
--space-12: 48px; /* 3rem */
--space-16: 64px; /* 4rem */
--space-20: 80px; /* 5rem */
--space-24: 96px; /* 6rem */
```

**应用规则：**
- 组件内部间距：`space-2`（8px）到 `space-4`（16px）
- 组件外边距：`space-4`（16px）到 `space-6`（24px）
- 区段间距：`space-8`（32px）到 `space-12`（48px）
- 页面顶部间距：`space-12`（48px）到 `space-16`（64px）

#### 内容宽度与断点

```css
/* 内容宽度 */
--width-content-sm: 640px;   /* 小屏内容 */
--width-content-md: 768px;   /* 中屏内容 */
--width-content-lg: 1024px;  /* 大屏内容 */
--width-content-xl: 1280px;  /* 超大屏内容 */

/* 响应式断点 */
--breakpoint-sm: 640px;      /* 移动端 */
--breakpoint-md: 768px;      /* 平板端 */
--breakpoint-lg: 1024px;     /* 桌面端 */
--breakpoint-xl: 1280px;     /* 大屏桌面 */
```

**验证状态：** ✅ 已检查源码 - 粒子动画使用 767px 作为移动端断点，需统一为 768px

### 2.4 视觉层级

#### 圆角

```css
/* 圆角等级 (保持现有) */
--radius-sm: 8px;       /* 小型控件 */
--radius-control: 10px; /* 标准控件（Input、Button） */
--radius-card: 12px;    /* 卡片 */
--radius-sheet: 16px;   /* 弹窗、抽屉 */
--radius-full: 9999px;  /* 圆形（头像、徽章） */
```

#### 阴影层级

```css
/* 阴影 (保持现有) */
--shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
--shadow-modal: 0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08);

/* 焦点阴影 */
--shadow-focus: 0 0 0 3px var(--color-focus-ring);

/* 深色场景阴影 (新增) */
--shadow-dark-card: 0 2px 8px rgba(0, 0, 0, 0.3);
--shadow-dark-elevated: 0 8px 24px rgba(0, 0, 0, 0.5);
```

#### 边框

```css
--border-width-thin: 1px;
--border-width-medium: 2px;
--border-width-thick: 3px;
```

### 2.5 动效系统

#### 动效时长

```css
--duration-instant: 100ms;   /* 即时反馈 */
--duration-fast: 150ms;      /* 快速过渡 */
--duration-base: 200ms;      /* 标准过渡 */
--duration-slow: 300ms;      /* 缓慢过渡 */
--duration-slower: 400ms;    /* 更慢过渡 */
```

#### 缓动曲线

```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

#### 动效应用规则

**标准交互：**
- Hover 状态：`duration-fast` + `ease-out`
- Focus 状态：`duration-fast` + `ease-out`
- Active 状态：`duration-instant` + `ease-in-out`
- 按钮点击：`active:scale-[0.97]` + `duration-fast`

**页面过渡：**
- 路由切换：`duration-base` + `ease-in-out`
- Modal 打开/关闭：`duration-slow` + `ease-out`
- Toast 进入/退出：`duration-base` + `ease-in-out`

**Reduced Motion 支持：**

设计系统需区分两类动态效果的 reduced-motion 策略：

**1. UI 动效（CSS transitions/animations）**
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**2. Three.js 粒子动画（独立处理）**
- 粒子动画由 `lensflow-v24.html` 内的 JavaScript 控制
- 不受全局 CSS `prefers-reduced-motion` 规则影响
- 需在粒子动画脚本中单独检测 `window.matchMedia('(prefers-reduced-motion: reduce)')` 并实施降级策略
- 降级策略：禁用粒子运动动画，保留静态粒子场景或切换为简化版本
- 确保滚动交互和动画生命周期管理不受 CSS 规则干扰

**验证状态：** ⚠️ 待实施验证 - 在 Phase 1 实施后，需在浏览器中开启 `prefers-reduced-motion` 测试：
1. UI 动效是否正确禁用或简化
2. 粒子动画是否按预期降级（需修改 `lensflow-v24.html` 脚本）
3. 滚动交互是否正常工作

### 2.6 Z-index 层级

```css
--z-base: 0;
--z-dropdown: 1000;
--z-sticky: 1100;
--z-modal-backdrop: 2000;
--z-modal: 2100;
--z-toast: 3000;
--z-tooltip: 4000;
```

---

## 3. 场景规则与令牌应用

### 3.1 品牌展示场景（落地页）

**背景：** `surface-dark-primary` (#000000)  
**文本：** `label-inverse` 系列  
**主题色：** `brand-primary` (#007AFF) + `brand-secondary` (#6B7A99)  
**交互元素：** 允许更大胆的动效和粒子动画

**设计令牌应用：**
```css
.landing-page {
  background: var(--color-surface-dark-primary);
  color: var(--color-label-inverse);
}

.landing-title {
  font-size: var(--text-display-xl); /* 64px */
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}

.landing-button {
  background: var(--color-brand-primary);
  border-radius: var(--radius-control);
  padding: var(--space-3) var(--space-6);
  transition: all var(--duration-base) var(--ease-out);
}
```

**验证状态：** ✅ 已检查源码 - 现有 lensflow-v24.html 使用纯黑背景和冷蓝灰粒子
**注意：** 这描述的是现有粒子页面的实际状态，不代表新令牌已通过实际渲染验证

### 3.2 业务工作区场景（摄影师/客户端）

**背景：** `surface-secondary` (#F2F2F7) 页面底色 + `surface-primary` (#FFFFFF) 卡片  
**文本：** 标准 `label` 系列  
**主题色：** `brand-primary` (#007AFF)  
**交互元素：** 强调可读性和操作效率

**设计令牌应用：**
```css
.page-container {
  background: var(--color-surface-secondary);
  padding: var(--space-6) var(--space-4);
}

.card {
  background: var(--color-surface-primary);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: var(--space-4);
}

.page-title {
  font-size: var(--text-heading-lg); /* 30px */
  font-weight: var(--font-weight-semibold);
  color: var(--color-label);
}

.button-primary {
  background: var(--color-brand-primary);
  color: var(--color-label-inverse);
  border-radius: var(--radius-control);
}
```

**验证状态：** ✅ 已检查源码 - 现有页面使用 `bg-system-bg-secondary` (#F2F2F7) 和 `bg-system-bg` (#FFFFFF)
**注意：** 这描述的是现有页面的实际使用状态，不代表新令牌已通过实际渲染验证

### 3.3 图像处理场景（照片浏览、选片、修图）

**背景：** `surface-neutral` (#F5F5F5) 避免色彩干扰  
**文本：** 标准 `label` 系列  
**主题色：** `brand-primary` 用于选中状态  
**交互元素：** 最小化装饰，突出照片内容

**设计令牌应用：**
```css
.photo-viewer {
  background: var(--color-surface-neutral);
}

.photo-grid-item {
  border: 2px solid var(--color-separator);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.photo-grid-item.selected {
  border-color: var(--color-brand-primary);
  box-shadow: var(--shadow-focus);
}

.photo-metadata {
  font-size: var(--text-caption);
  color: var(--color-label-secondary);
}
```

**验证状态：** ⚠️ 待实施验证 - 当前照片浏览功能未完整实现，需在功能实现后验证设计令牌的实际效果

### 3.4 身份认证场景（登录、注册）

**背景：** 可以选择浅色或深色  
**表单布局：** iOS 风格分组表单（使用 `surface-grouped`）  
**文本：** 标准 `label` 系列  
**主题色：** `brand-primary`

**设计令牌应用：**
```css
.auth-page {
  background: var(--color-surface-secondary);
}

.form-group {
  background: var(--color-surface-grouped);
  border-radius: var(--radius-card);
}

.form-input-grouped {
  background: transparent;
  border: 0;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-separator);
}

.form-input-grouped:last-child {
  border-bottom: 0;
}
```

**验证状态：** ✅ 已检查源码 - 现有登录/注册页面使用 iOS 风格分组表单，但存在样式覆盖问题（`border-0 p-0 focus:ring-0`）
**注意：** 这描述的是现有问题，不代表新的 `variant="grouped"` 已通过测试

---

## 4. 核心组件规范

### 4.1 现有组件复用清单

**完全保留（无需修改）：**
- ✅ **Card** - 卡片容器，设计令牌使用正确
- ✅ **LargeTitle** - 大标题，符合 iOS 风格
- ✅ **SectionHeader** - 区段标题，符合 iOS 风格
- ✅ **ListGroup** - 列表组容器，符合 iOS 风格
- ✅ **ListItem** - 列表项，功能完整
- ✅ **Badge** - 徽章，变体清晰
- ✅ **StatusBadge** - 状态徽章，映射完整

**需要增强（保留基础，新增功能）：**
- ⚠️ **Button** - 需要新增 `loading` 和 `icon` 支持
- ⚠️ **Input** - 需要新增 `variant="grouped"` 变体
- ⚠️ **Select** - 需要新增 `variant="grouped"` 变体
- ⚠️ **Textarea** - 需要新增 `variant="grouped"` 变体

**验证状态：** ✅ 已检查源码 - 审计报告第 4 节"现有 UI 组件审计"已确认组件清单

### 4.2 需要新建的组件清单

#### 优先级 🔴 高（Phase 2 实施）

**Toast / Notification**
```typescript
interface ToastProps {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  duration?: number // 默认 3000ms
  onClose?: () => void
}

// 全局状态管理
interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}
```

**功能要求：**
- 全局提示系统，使用 Portal 渲染
- 支持 4 种类型（success/warning/error/info）
- 自动消失（可配置时长）
- 支持手动关闭
- 多条消息堆叠显示
- 支持从顶部或底部弹出

**无障碍要求：**
- `role="alert"` 或 `role="status"`
- `aria-live="polite"` 或 `aria-live="assertive"`（错误消息）

---

**Modal / Dialog**
```typescript
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdrop?: boolean // 默认 true
  closeOnEsc?: boolean // 默认 true
}
```

**功能要求：**
- 对话框容器，支持标题、内容、操作按钮
- 遮罩层（半透明黑色）
- 焦点陷阱（打开时锁定焦点在 Modal 内）
- ESC 键关闭
- 点击背景关闭（可配置）
- 阻止背景滚动
- 支持嵌套 Modal

**无障碍要求：**
- `role="dialog"` 或 `role="alertdialog"`
- `aria-modal="true"`
- `aria-labelledby` 指向标题
- 焦点管理（打开时聚焦到第一个可交互元素，关闭后恢复到触发元素）

---

**Spinner / Loading**
```typescript
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'white' | 'gray'
}
```

**功能要求：**
- 加载指示器，支持不同尺寸
- 支持不同颜色（适配浅色/深色背景）
- 平滑旋转动画

**无障碍要求：**
- `role="status"`
- `aria-label="加载中"`

---

**Empty State**
```typescript
interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}
```

**功能要求：**
- 统一的空状态组件
- 支持自定义图标、文案、操作按钮
- 中央对齐，视觉层级清晰

---

#### 优先级 🟡 中（Phase 3 实施）

**Drawer**
```typescript
interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  position?: 'left' | 'right' | 'top' | 'bottom'
  size?: 'sm' | 'md' | 'lg' | 'full'
  children: ReactNode
}
```

**功能要求：**
- 侧边抽屉，支持从四个方向滑入
- 遮罩层
- 滑动动画
- 焦点陷阱

---

**Tabs**
```typescript
interface TabsProps {
  tabs: { key: string; label: string }[]
  activeKey: string
  onChange: (key: string) => void
  variant?: 'default' | 'pills'
}
```

**功能要求：**
- 标签页切换，支持默认和胶囊两种样式
- 键盘导航（左右箭头切换）
- 支持受控和非受控模式

**无障碍要求：**
- `role="tablist"`、`role="tab"`、`role="tabpanel"`
- `aria-selected` 标记当前选中
- 键盘导航支持

---

**Checkbox / Radio**
```typescript
interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  indeterminate?: boolean // 半选状态
}

interface RadioProps {
  value: string
  checked: boolean
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
  name: string // 必填，用于分组
}
```

---

**Switch**
```typescript
interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  size?: 'sm' | 'md'
}
```

---

**Progress**
```typescript
interface ProgressProps {
  value: number // 0-100
  max?: number // 默认 100
  showLabel?: boolean
  variant?: 'linear' | 'circular'
}
```

---

#### 优先级 🟢 低（Phase 4 或后续）

- **Tooltip** - 提示气泡
- **Avatar** - 用户头像
- **Breadcrumb** - 面包屑导航
- **Pagination** - 分页
- **Skeleton** - 骨架屏
- **DatePicker** - 日期选择器（考虑使用第三方库）

---

## 5. 组件增强规范

### 5.1 Button 组件增强

**当前状态：** ✅ 已检查源码 - 完整的变体和尺寸支持已实现  
**增强需求：** 新增 `loading` 和 `icon` 支持

**新增 Props：**
```typescript
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  
  // 新增
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}
```

**实现要点：**
- `loading` 状态时显示 Spinner，禁用按钮
- `leftIcon` 和 `rightIcon` 自动添加间距（`space-2`）
- `loading` 时隐藏文字和图标，显示 Spinner

**示例用法：**
```tsx
<Button variant="filled" loading={isSubmitting}>
  提交
</Button>

<Button variant="tinted" leftIcon={<PlusIcon />}>
  新增订单
</Button>
```

### 5.2 Input / Select / Textarea 组件增强

**当前状态：** ✅ 已检查源码 - 统一的标签和错误提示样式已实现  
**问题：** 表单页面需要覆盖默认样式（`border-0 p-0 focus:ring-0`）才能实现 iOS 分组表单

**增强方案：** 新增 `variant="grouped"` 变体

**新增 Props：**
```typescript
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  
  // 新增
  variant?: 'default' | 'grouped'
}
```

**变体样式：**
```typescript
const variantClasses = {
  default: 'w-full rounded-control border border-separator-opaque bg-system-bg px-3.5 py-2.5 ...',
  grouped: 'w-full bg-transparent border-0 p-0 focus:ring-0 ...',
}
```

**应用场景：**
- `default` - 独立表单、搜索框
- `grouped` - iOS 风格分组表单（登录、注册、预约页面）

**迁移影响：**
- 移除 LoginPage 中的 `className="border-0 p-0 focus:ring-0"`
- 移除 RegisterPage 中的样式覆盖
- 移除 BookingPage 中的样式覆盖

**验证方式（Phase 3 执行）：**
- 在 LoginPage 上测试 `variant="grouped"`
- 确认焦点样式、错误状态正常工作
- 测试键盘导航和无障碍
- 视觉对比确保与原页面一致

---

## 6. Tailwind CSS v4 令牌映射规则

### 6.1 `@theme` 命名空间规则

Tailwind CSS v4 通过 `@theme` 指令将 CSS 自定义属性映射为工具类。并非所有变量都需要通过 `@theme` 暴露。

**使用 `@theme` 的变量（生成工具类）：**

```css
@theme {
  /* 颜色 - 生成 bg-brand-primary, text-action-primary 等 */
  --color-brand-primary: #6B7A99;
  --color-action-primary: #007AFF;
  --color-label: #1C1C1E;
  --color-surface-primary: #FFFFFF;
  
  /* 间距 - 生成 p-4, m-6, gap-8 等 */
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  
  /* 字号 - 生成 text-heading-lg, text-body 等 */
  --text-heading-lg: 30px;
  --text-body: 16px;
  
  /* 圆角 - 生成 rounded-control, rounded-card 等 */
  --radius-control: 10px;
  --radius-card: 12px;
}
```

**仅作为 CSS 自定义属性的变量（不生成工具类）：**

```css
/* 在 :root 中定义，不在 @theme 中 */
:root {
  /* 动效 - 仅在组件内使用 var(--duration-fast) */
  --duration-fast: 150ms;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  
  /* 阴影 - 仅在组件内使用 var(--shadow-card) */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04);
  
  /* Z-index - 仅在组件内使用 var(--z-modal) */
  --z-modal: 2100;
}
```

**职责划分：**
- **`@theme`** - 需要生成工具类的令牌（颜色、间距、字号、圆角、断点）
- **`:root`** - 仅在组件内通过 `var()` 使用的令牌（动效、阴影、z-index）

### 6.2 令牌验证清单（Phase 1 执行）

**验证步骤：**

1. **扩展 `frontend/src/index.css`**
   - 在 `@theme` 中新增约 60 个令牌
   - 在 `:root` 中新增约 40 个令牌
   
2. **执行构建验证**
   ```bash
   cd frontend
   npm run build
   ```
   - 检查构建日志中是否有 Tailwind 警告
   - 确认生成的 CSS 文件大小未异常增加

3. **验证工具类生成**
   - 在组件中使用新令牌（如 `bg-brand-primary`, `text-action-primary`）
   - 检查浏览器 DevTools，确认工具类已生成且值正确
   - 测试示例：创建测试组件使用所有新令牌

4. **验证向后兼容**
   - 运行现有页面，确保视觉无变化
   - 检查控制台无错误或警告
   - 截图对比：首页、登录页、仪表盘

**验收标准：**
- [ ] TypeScript 类型检查通过（`tsc --noEmit`）
- [ ] 生产构建成功（`vite build`）
- [ ] 所有 `@theme` 令牌生成对应工具类
- [ ] 现有页面视觉无变化（向后兼容）
- [ ] 新令牌可在组件中正常使用

---

## 7. 实施阶段定义与迁移计划

### 7.1 Phase 定义（统一全文档）

本设计系统实施分为 **5 个 Phase**，每个 Phase 有明确的目标和产出。

**Phase 1: Design Tokens**（1 周）
- 扩展 `frontend/src/index.css` 中的设计令牌
- 验证 Tailwind CSS v4 集成
- 建立令牌使用文档

**Phase 2: 核心组件**（2 周）
- Week 1: 增强现有组件（Button/Input/Select/Textarea）
- Week 2: 新增核心组件（Toast/Modal/Spinner/Empty State）
- 单元测试覆盖

**Phase 3: 试点页面迁移**（2 周）
- Week 1: LoginPage、DashboardPage
- Week 2: OrdersPage、回归测试
- 验证设计系统适用性

**Phase 4: 其余现有页面迁移**（3-4 周）
- Week 1: RegisterPage、BookingPage、BookingDetailPage
- Week 2: OrderDetailPage、UploadPage、AnalysisResultPage
- Week 3: ClientPage、SelectionPage、DeliveryPage、RetouchPage
- Week 4: NotFoundPage、文档完善

**Phase 5: 全系统验收**（1 周）
- 视觉一致性测试
- 交互一致性测试
- 无障碍测试
- 性能测试
- 文档完善

**总时长：** 9-10 周

**独立技术债务（不纳入首轮 Design System 实施）：**
- 订单状态映射抽离 - 可在 Phase 2 顺带完成，但非强制
- 路由跳转重构 - 可在 Phase 3 顺带完成，但非强制
- 移除 Ant Design 依赖 - 需单独验证和排期
- 图片懒加载 - 需先实现照片浏览功能
- 批量操作、筛选排序等业务功能 - 单独排期

### 7.2 Phase 3 试点页面选择原则

**选择标准：**
1. 覆盖不同场景（品牌展示、业务工作区、表单）
2. 包含主要问题点（样式覆盖、路由混用）
3. 用户高频访问路径
4. 相对独立，风险可控

### 7.2 Phase 3 试点页面选择原则

**选择标准：**
1. 覆盖不同场景（品牌展示、业务工作区、表单）
2. 包含主要问题点（样式覆盖、路由混用）
3. 用户高频访问路径
4. 相对独立，风险可控

**试点页面（Phase 3）：**
1. **LoginPage** (`/login`) - 验证 Input `variant="grouped"`
2. **DashboardPage** (`/dashboard`) - 验证路由跳转修复（可选）
3. **OrdersPage** (`/orders`) - 验证 Empty State 组件

**注意：** 路由跳转重构和状态映射抽离属于技术债务，非 Design System 核心工作。Phase 3 可选择性处理，不作为强制要求。

### 7.3 Phase 1 任务清单（Design Tokens）

**任务清单：**
- [x] 扩展 `frontend/src/index.css` 中的 `@theme` 定义
- [x] 新增字号、字重、行高令牌
- [x] 新增间距令牌（Tailwind 使用 `--spacing-*`，CSS 保留 `--space-*` 别名）
- [x] 新增动画/过渡令牌（`:root` 中）
- [x] 新增 z-index 令牌（`:root` 中）
- [x] 修订品牌色定义（`brand-primary` 为粒子蓝灰，`action-primary` 为 iOS 蓝）
- [x] 新增深色场景令牌（`surface-dark-*`, `label-inverse-*`）
- [x] 新增图像处理场景令牌（`surface-neutral`）
- [x] 实施 reduced-motion 策略（区分 UI 动效和粒子动画）

**验收标准：**
- [x] TypeScript 类型检查通过
- [x] 生产构建成功
- [x] 所有 `@theme` 令牌可生成对应工具类（`npm.cmd run check:tokens` 编译验证）
- [ ] 现有页面视觉无变化（截图对比验证）
- [ ] 对比度验证（WebAIM Contrast Checker）

**当前验证说明：** 新增令牌的推荐普通文字组合已通过 WCAG 公式计算检查（`check:contrast`），页面仍存在原有低对比度颜色；全量测试中的 14 项失败也在改动前副本中复现。以上项目不标记为全系统验收通过。已有 `shadow-card/elevated/focused` 工具类继续保留在 `@theme`，避免破坏页面兼容性。

---

### 7.4 Phase 2 任务清单（核心组件）

**Week 1: 修复现有组件**
- [x] Button 组件新增 `loading` prop
- [x] Button 组件新增 `leftIcon` 和 `rightIcon` props
- [x] Input 组件新增 `variant="grouped"`
- [x] Select 组件新增 `variant="grouped"`
- [x] Textarea 组件新增 `variant="grouped"`
- [ ] （可选，延后至页面迁移）创建 `src/constants/orderStatus.ts` 抽离状态映射
- [x] 创建单元测试验证组件增强

**验收标准：**
- [x] 组件 Props 类型定义完整
- [x] 单元测试覆盖新增功能
- [x] 提供独立组件预览页 `/design-system.html` 与使用文档（项目未配置 Storybook）
- [x] 向后兼容（不破坏现有用法）

---

**Week 2: 新增核心组件**
- [x] 实现 Toast 组件 + Zustand 状态管理
- [x] 实现 Modal 组件 + 焦点陷阱
- [x] 实现 Spinner 组件
- [x] 实现 Empty State 组件
- [x] 为每个组件编写单元测试
- [x] 为每个组件编写使用文档

**验收标准：**
- [x] 组件功能完整
- [x] 无障碍要求满足（ARIA 标签、键盘导航）
- [x] 单元测试覆盖率 > 80%
- [x] 支持 reduced-motion

---

**本阶段验收记录（2026-10-16）：** 组件测试 45/45 通过；P2 覆盖范围行覆盖率 100%、分支覆盖率 94.84%，四项指标均超过 80%。真实浏览器检查了嵌套对话框、焦点循环/恢复、通知与对话框共用及手机宽度。预览页初始状态 Lighthouse 无障碍得分 100；完整业务页面及屏幕阅读器验收留待页面迁移。全量测试 61/75 通过，14 项失败与 P1 一致，无新增。生产包 860,590 bytes，较 P1 增长 1.35%；本阶段未重测页面导航性能。详见 [P2 机器结果](docs/design-system-phase-2-results.json)。

---

### 7.5 Phase 3 任务清单（试点页面迁移）

**Week 1: LoginPage**

**迁移任务：**
- [x] 将所有 Input 改为 `variant="grouped"`
- [x] 移除样式覆盖代码（`className="border-0 p-0 focus:ring-0"`）
- [x] 统一按钮使用设计令牌（移除内联样式）
- [x] 测试表单验证、错误提示、焦点状态

**验收标准：**
- [x] 登录基础布局截图核对；颜色和焦点为预期调整（详见 P3 报告）
- [x] 登录流程完整测试（成功、失败、loading）
- [x] 键盘导航正常（Tab、Enter）
- [x] 焦点样式正确（focus ring）
- [x] 无控制台错误或警告

---

**Week 1: DashboardPage**

**迁移任务：**
- [x] （可选）替换所有 `window.location.href` 为 `navigate()`
- [x] 使用新的 Empty State 组件替换内联实现
- [ ] （可选，延后）统一使用 `orderStatus.ts` 常量
- [x] 测试所有链接和跳转

**验收标准：**
- [x] 空状态显示正确
- [x] 基础布局截图核对；共享空状态、caption 行高和颜色变化已记录
- [x] （如果修改路由）所有跳转使用 React Router
- [x] （如果修改路由）历史栈正常（浏览器前进后退）

---

**Week 2: OrdersPage**

**迁移任务：**
- [x] （可选）替换 `window.location.href` 为 `navigate()`
- [x] 使用新的 Empty State 组件
- [ ] （可选，延后）统一使用 `orderStatus.ts` 常量

**验收标准：**
- [x] 订单列表加载正确
- [x] 空状态显示正确
- [x] 点击跳转正常
- [x] 状态徽章显示正确

---

**Week 2: 回归测试**

**测试范围：**
- [x] 登录/注册流程（模拟 API 回归）
- [x] 摄影师工作台
- [x] 订单列表
- [ ] 路由跳转（所有页面；本阶段已验证试点页面及关联详情）
- [x] 粒子文件与动画回调频率检查（文件哈希一致、约 60fps；导航性能门槛未通过，见报告）

**测试清单：**
- [ ] 功能测试（所有核心业务流程；本阶段已完成试点的模拟 API 回归）
- [x] 视觉测试（截图对比）
- [x] 性能测试（已完成基线对比；试点和包体积通过，粒子页评分/FCP 待复核）
- [x] 无障碍测试（试点页面键盘导航、自动扫描）
- [ ] 真实屏幕阅读器及完整业务端到端验收
- [x] 响应式测试（移动端、平板、桌面）

---

**P3 实施记录（2026-10-16）：** 三个试点已迁移。页面及注册回归 25 项、组件测试 45 项通过；全量 85/95 通过，消除 4 项试点旧失败、无新增失败。375/768/1280px 宽度无横向溢出，三个试点空数据页面各 3 次 Lighthouse 性能及无障碍均为 100。检查使用合成 API，广泛业务回归与真实屏幕阅读器仍待验收。详见 [迁移与验证报告](docs/design-system-phase-3.md)、[机器结果](docs/design-system-phase-3-results.json)。

---

### 7.6 每阶段验收检查清单

**代码质量：**
- [ ] TypeScript 类型检查通过（`tsc --noEmit`）
- [ ] ESLint 无错误
- [ ] 生产构建成功（`vite build`）
- [ ] 单元测试通过（新增/修改的组件）

**功能验证（不修改现有业务逻辑）：**
- [ ] 登录/注册流程完整
- [ ] 预约创建和确认
- [ ] 订单状态流转
- [ ] 所有路由跳转正常

**视觉验证：**
- [ ] 与原页面视觉一致（截图对比）
- [ ] 不同屏幕尺寸下的布局（375px / 768px / 1280px）
- [ ] 焦点样式正确
- [ ] Loading 状态正确

**性能验证（基于基线）：**
- [ ] 粒子主页滚动动画流畅（基线对比）
- [ ] 页面加载时间未显著增加（基线对比）
- [ ] 生产构建体积未显著增加（基线对比）

**无障碍验证：**
- [ ] 键盘导航完整（Tab、Enter、ESC）
- [ ] ARIA 标签正确
- [ ] 颜色对比度符合 WCAG AA（WebAIM Contrast Checker 验证）

---

## 8. 风险评估与回归测试

## 8. 风险评估与回归测试

### 8.1 高风险改动

| 改动 | 影响范围 | 风险级别 | 缓解措施 |
|------|---------|---------|---------|
| **Input 组件重构** | LoginPage、RegisterPage、BookingPage、BookingDetailPage | 🔴 高 | 分阶段迁移，保留旧版 API（`variant="default"` 为默认值），每个页面独立测试后再迁移下一个 |
| **路由跳转方式修改** | DashboardPage、OrdersPage、ClientPage（3个页面，共约10处跳转） | 🔴 高 | 全面测试所有路由跳转，验证历史栈，测试浏览器前进后退。**注意：此项为技术债务，非 Design System 核心工作，Phase 3 可选** |
| **状态映射抽离** | OrdersPage、OrderDetailPage、UploadPage、ClientPage、DeliveryPage（5个页面） | 🟡 中 | 确保映射逻辑完全一致，添加单元测试验证映射表完整性。**注意：此项为技术债务，可在 Phase 2 顺带完成，非强制** |
| **新增 Toast 系统** | 未来替换所有页面级错误/成功横幅 | 🟡 中 | Phase 2 创建组件，Phase 3 试点页面不强制迁移，作为可选增强 |

### 8.2 识别的技术债务与处理策略

**A 类：Design System 工作（本轮重点）**
- [ ] 建立完整的设计令牌系统
- [ ] 修复 Input 组件样式覆盖问题
- [ ] 新增核心缺失组件（Toast、Modal、Spinner、Empty State）
- [ ] 建立组件文档和使用规范

**B 类：技术债务（单独排期，不纳入 Design System 首轮实施）**
- [ ] 统一路由跳转方式（混用 `window.location.href`）- Phase 3 可选处理
- [ ] 状态映射重复定义 - Phase 2 可顺带完成，非强制
- [ ] 移除 Ant Design 依赖（需要验证是否真的未使用）
- [ ] 缺少 ARIA 标签（逐步补充）
- [ ] 图片懒加载缺失（需要先实现照片浏览功能）

**C 类：业务功能增强（不纳入本轮）**
- [ ] 照片预览和缩略图
- [ ] 批量操作（全选、反选）
- [ ] 筛选排序功能
- [ ] 上传体验增强（进度条、拖拽上传）
- [ ] 在线预览功能
- [ ] 日程视图
- [ ] 消息通知系统

**重要原则：**
- Design System 工作（A 类）不因技术债务（B 类）或业务功能（C 类）而扩大范围
- 保持当前组件复用与业务边界，不修改 API、不重构权限逻辑、不新增业务功能
- 任何涉及现有业务行为的改动都应另外排期

### 8.3 必须测试的功能

**核心业务流程（不修改业务逻辑，仅验证未被破坏）：**
1. ✅ 登录/注册流程
2. ✅ 预约创建和确认
3. ✅ 订单状态流转
4. ✅ 照片上传和分析
5. ✅ 选片功能
6. ✅ 修图协作
7. ✅ 交付下载

**测试策略：**
- **单元测试：** 新增/修改的组件（Button、Input、Toast、Modal、Spinner、Empty State）
- **集成测试：** 表单提交、API 调用（确保未被破坏）
- **E2E 测试：** 核心业务流程（登录 → 创建预约 → 确认 → 上传照片）
- **视觉回归测试：** 使用截图对比工具（Percy / Chromatic / 手动截图）

**测试环境：**
- 浏览器：Chrome、Firefox、Safari
- 屏幕尺寸：375px（移动）、768px（平板）、1280px（桌面）
- 无障碍：键盘导航、屏幕阅读器（NVDA / VoiceOver）

### 8.4 回归测试清单

**粒子主页回归：**
- [ ] 粒子动画正常加载
- [ ] 滚动交互变形动画流畅
- [ ] 按钮点击跳转正常（postMessage 通信）
- [ ] 移动端降级正常（reduced-motion）
- [ ] 性能无明显下降（60fps）

**表单页面回归：**
- [ ] 登录页面视觉无变化
- [ ] 注册页面视觉无变化
- [ ] 预约页面视觉无变化
- [ ] 焦点样式正确
- [ ] 错误提示正常显示
- [ ] 表单验证正常工作

**列表页面回归：**
- [ ] 订单列表加载正确
- [ ] 状态徽章显示正确
- [ ] 空状态显示正确
- [ ] 点击跳转正常

---

## 9. 性能验收基线与标准

### 9.1 建立性能基线（Phase 1 开始前执行）

在开始任何修改前，必须建立当前系统的性能基线，作为后续对比依据。

**测试设备与环境：**
- **设备：** MacBook Pro / ThinkPad（具体型号需记录）
- **浏览器：** Chrome 稳定版（记录版本号）
- **网络：** 本地开发环境（localhost）
- **测试时间：** Phase 0 完成后，Phase 1 开始前

**测试项目与测量方式：**

| 指标 | 测量方式 | 当前基线 | 测量位置 |
|------|---------|---------|---------|
| **Lighthouse 性能评分** | Chrome DevTools → Lighthouse → Performance | 待测量 | 首页 `/`, 登录页 `/login`, 仪表盘 `/dashboard` |
| **首屏加载时间（FCP）** | Chrome DevTools → Performance → First Contentful Paint | 待测量 | 首页 `/` |
| **最大内容绘制（LCP）** | Chrome DevTools → Performance → Largest Contentful Paint | 待测量 | 首页 `/` |
| **生产包体积（gzip）** | `vite build` 后检查 `dist/assets/*.js` 文件大小总和 | 待测量 | 构建输出日志 |
| **粒子动画帧率** | Chrome DevTools → Performance → 录制 5 秒滚动交互，检查帧率图表 | 待测量 | 首页 `/` |

**基线测量步骤：**

1. **清理缓存**
   ```bash
   # 清理构建缓存
   cd frontend
   rm -rf dist node_modules/.vite
   ```

2. **执行生产构建**
   ```bash
   npm run build
   # 记录构建输出的文件大小
   ```

3. **启动生产服务器**
   ```bash
   npm run preview
   ```

4. **运行 Lighthouse**
   - 打开 Chrome DevTools
   - 切换到 Lighthouse 面板
   - 模式：Desktop
   - 类别：Performance, Accessibility
   - 运行 3 次取平均值

5. **测量粒子动画帧率**
   - 打开 Chrome DevTools → Performance
   - 开始录制
   - 在首页滚动 5 秒
   - 停止录制
   - 检查帧率图表，记录平均帧率和最低帧率

6. **记录基线数据**
   ```markdown
   ## 性能基线数据（2026-10-16）
   
   **测试环境：**
   - 设备：[记录设备型号]
   - 浏览器：Chrome [版本号]
   - 网络：localhost
   
   **Lighthouse 评分：**
   - 首页 `/`: Performance [分数], Accessibility [分数]
   - 登录页 `/login`: Performance [分数], Accessibility [分数]
   - 仪表盘 `/dashboard`: Performance [分数], Accessibility [分数]
   
   **加载时间：**
   - 首屏 FCP: [毫秒]
   - 最大内容绘制 LCP: [毫秒]
   
   **包体积：**
   - 总大小（gzip）: [KB]
   - 主 JS 文件: [KB]
   - CSS 文件: [KB]
   
   **动画性能：**
   - 粒子动画平均帧率: [fps]
   - 粒子动画最低帧率: [fps]
   ```

### 9.2 性能验收标准

**硬性质量门槛（Phase 验收时必须满足）：**

| 指标 | 标准 | 说明 |
|------|------|------|
| **TypeScript 编译** | 无错误 | `tsc --noEmit` 必须通过 |
| **ESLint 检查** | 无错误 | 警告可接受，错误必须修复 |
| **生产构建** | 成功 | `vite build` 必须成功 |
| **单元测试** | 通过 | 新增/修改的组件测试必须通过 |
| **核心业务流程** | 未被破坏 | 登录、预约、上传等流程必须正常 |

**性能优化目标（基于基线的相对标准）：**

| 指标 | 目标 | 说明 |
|------|------|------|
| **Lighthouse 性能评分** | 不低于基线 -5 分 | 例如基线 85 分，Phase 验收时不低于 80 分 |
| **首屏加载时间** | 不超过基线 +20% | 例如基线 1000ms，验收时不超过 1200ms |
| **生产包体积** | 不超过基线 +10% | 例如基线 400KB，验收时不超过 440KB |
| **粒子动画帧率** | 平均帧率不低于基线 -10fps | 例如基线 58fps，验收时不低于 48fps |

**说明：**
- 硬性门槛是必须满足的，不满足则 Phase 不通过
- 优化目标是期望值，超出目标需分析原因并评估是否可接受
- 如果性能劣化超出目标但有合理原因（如新增必要功能），需文档化说明
- 基线数据在 Phase 1 开始前测量，Phase 3、Phase 5 验收时对比

### 9.3 性能劣化分析流程

如果性能指标超出优化目标，执行以下分析：

1. **确认测量环境一致**（设备、浏览器、网络）
2. **使用 Chrome DevTools Performance 分析瓶颈**
3. **检查包体积变化**（`vite build --reportCompression`）
4. **评估是否可接受**
   - 如果因新增必要组件（Toast/Modal）导致，可接受
   - 如果因代码冗余或错误引入依赖，必须修复
5. **文档化决策**（记录劣化原因和接受理由）

---

## 10. 未验证的技术结论

以下结论需要在实施过程中验证，**在验证前不应作为既定事实**：

## 10. 未验证的技术结论

以下结论需要在实施过程中验证，**在验证前不应作为既定事实**：

### 10.1 依赖相关

| 结论 | 验证状态 | 验证方式 |
|------|---------|---------|
| Ant Design 未在代码中使用 | ⚠️ 待验证 | 全局搜索 `import.*from.*antd`，检查是否有任何导入 |
| 移除 Ant Design 可减少打包体积 ~500KB | ⚠️ 待验证 | 先验证是否使用，再执行 `pnpm remove antd`，对比构建前后的 `dist/` 大小 |
| Three.js 使用 CDN 加载 | ✅ 已检查源码 | 审计报告确认使用 `<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js">` |

**验证步骤（Ant Design）：**
```bash
# 1. 搜索代码中的 antd 导入
grep -r "from 'antd'" frontend/src/
grep -r 'from "antd"' frontend/src/

# 2. 检查间接依赖
npm ls antd

# 3. 如果确认未使用，移除依赖
pnpm remove antd

# 4. 构建并对比大小
pnpm build
# 对比 dist/ 目录大小
```

### 10.2 性能相关

| 结论 | 验证状态 | 验证方式 |
|------|---------|---------|
| 粒子主页支持 reduced-motion 降级 | ⚠️ 待实施验证 | 在浏览器中开启 `prefers-reduced-motion`，观察粒子动画是否停止或简化 |
| 移动端粒子动画有降级策略 | ⚠️ 待实施验证 | 在移动端设备或模拟器上测试，观察粒子数量是否减少 |
| 设计令牌扩展对性能无影响 | ⚠️ 待实施验证 | Phase 1 完成后，使用 Lighthouse 对比令牌扩展前后的性能评分 |
| 图片懒加载可提升首屏性能 | ⚠️ 待实施验证 | 实现后测试，当前照片浏览功能未实现 |

**验证步骤（Reduced Motion）：**
1. Chrome DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion`
2. 打开 `/` 落地页
3. 观察 UI 动效是否被禁用（按钮 hover、过渡动画）
4. 检查粒子动画是否降级（需在 `lensflow-v24.html` 中实施 `matchMedia` 检测）

### 10.3 无障碍相关

| 结论 | 验证状态 | 验证方式 |
|------|---------|---------|
| 颜色对比度符合 WCAG AA 标准 | ⚠️ 待实施验证 | Phase 1 完成后，使用 Chrome DevTools Lighthouse 或 axe DevTools 检查颜色对比度 |
| 键盘导航完整 | ⚠️ 待实施验证 | Phase 3 完成后，手动测试所有迁移页面的 Tab 键导航 |
| 屏幕阅读器支持 | ⚠️ 待实施验证 | Phase 3 完成后，使用 NVDA（Windows）或 VoiceOver（macOS）测试 |

**验证步骤（颜色对比度）：**
1. 使用 Chrome Lighthouse 运行无障碍审计
2. 检查报告中的 "Background and foreground colors do not have a sufficient contrast ratio"
3. 使用 WebAIM Contrast Checker 手动验证主要颜色组合：
   - `#007AFF`（操作色）on `#FFFFFF`（白色背景）
   - `#6B7A99`（品牌色）on `#FFFFFF`（白色背景）
   - `#1C1C1E`（文本）on `#FFFFFF`（白色背景）
   - `#FFFFFF`（白色文本）on `#007AFF`（操作色背景）
   - `#FFFFFF`（白色文本）on `#6B7A99`（品牌色背景）

### 10.4 业务逻辑相关

| 结论 | 验证状态 | 验证方式 |
|------|---------|---------|
| 订单状态映射在 5+ 文件中重复定义 | ✅ 已检查源码 | 审计报告第 10.1 节确认 |
| 路由混用 `window.location.href` 在 3 个页面 | ✅ 已检查源码 | 审计报告第 10.8 节确认（DashboardPage、OrdersPage、ClientPage） |
| 摄影师和客户角色权限在路由层面正确实现 | ⚠️ 待验证 | 手动测试：用摄影师账号访问客户端页面，用客户账号访问摄影师页面，观察是否正确拦截 |

**验证步骤（角色权限）：**
1. 读取 `ProtectedRoute.tsx` 源码，检查是否有角色级别的权限控制
2. 创建摄影师账号和客户账号
3. 测试跨角色访问是否被拦截
4. 如果当前未实现角色权限，标记为"待实现"

---

## 11. 实施时间线（统一全文档）

## 11. 实施时间线（统一全文档）

### Phase 0: 审计与准备 ✅ 已完成
- ✅ 完成 UI/UX 全面审计
- ✅ 识别所有组件和页面
- ✅ 列出问题清单和优先级
- ✅ 修订设计系统方案（v1.2）

### Phase 1: Design Tokens（1 周）
**目标：** 建立完整的设计令牌系统

**开始前置任务：**
- [ ] 建立性能基线（Lighthouse、FCP、LCP、包体积、帧率）

**主要任务：**
- [ ] 扩展 `frontend/src/index.css` 中的设计令牌（~100 个）
- [ ] 区分 `@theme` 和 `:root` 变量
- [ ] 修订品牌色定义（`brand-primary` 粒子蓝灰，`action-primary` iOS 蓝）
- [ ] 实施 reduced-motion 策略（UI 动效 + 粒子动画）
- [ ] 验证对比度（WebAIM Contrast Checker）

**产出：**
- ✅ 扩展后的 `index.css`（包含完整令牌）
- ✅ Design Tokens 使用文档
- ✅ Tailwind 工具类生成验证
- ✅ 性能基线对比报告

**验收标准（参考第 6.2 节）：**
- [ ] TypeScript 类型检查通过
- [ ] 生产构建成功
- [ ] 所有 `@theme` 令牌生成对应工具类
- [ ] 现有页面视觉无变化（截图对比）
- [ ] 性能指标符合优化目标（不超过基线）

### Phase 2: 核心组件（2 周）
**目标：** 修复现有组件问题，新增核心缺失组件

**Week 1: 修复现有组件**
- [x] Button 组件新增 `loading` 和 `icon` 支持
- [x] Input/Select/Textarea 组件新增 `variant="grouped"`
- [ ] （可选，延后至页面迁移）创建 `src/constants/orderStatus.ts`
- [x] 单元测试

**Week 2: 新增核心组件**
- [x] Toast 组件 + Zustand 状态管理
- [x] Modal 组件 + 焦点陷阱
- [x] Spinner 组件
- [x] Empty State 组件
- [x] 单元测试

**产出：**
- ✅ 修复后的组件
- ✅ 新增的核心组件
- ✅ 单元测试（覆盖率 > 80%）
- ✅ 组件使用文档

**验收标准（参考第 7.4 节）：**
- [x] 组件功能完整
- [x] 向后兼容（不破坏现有用法）
- [x] 无障碍要求满足（ARIA、键盘导航）
- [x] 支持 reduced-motion

### Phase 3: 试点页面迁移（2 周）
**目标：** 迁移 3 个代表性页面，验证设计系统适用性

**Week 1:**
- [x] LoginPage 迁移（`variant="grouped"`）
- [x] DashboardPage 迁移（Empty State）

**Week 2:**
- [x] OrdersPage 迁移（Empty State）
- [ ] 全面回归测试

**产出：**
- ✅ 迁移后的 3 个页面
- ✅ 回归测试报告
- ✅ 问题修复和调整
- ✅ 性能对比报告

**验收标准（参考第 7.5 节）：**
- [x] 试点截图核对，预期视觉变化见 P3 报告
- [ ] 核心业务流程未被破坏
- [ ] 性能指标符合优化目标
- [ ] 无障碍测试通过

### Phase 4: 其余现有页面迁移（3-4 周）
**目标：** 将所有剩余页面迁移到新设计系统

**优先级排序：**
- [x] Week 1: RegisterPage、BookingPage、BookingDetailPage
- [x] Week 2: OrderDetailPage、UploadPage、AnalysisResultPage
- [x] Week 3: ClientPage、SelectionPage、DeliveryPage、RetouchPage
- [x] Week 4: NotFoundPage、文档完善

**产出：**
- ✅ 所有页面迁移完成
- ✅ 组件使用文档
- ✅ 迁移指南

**实施验收（2026-10-16）：**
- [x] 计划内 11 页迁移完成，API 与状态流转规则保留
- [x] 全量单元测试 124/124 通过，P3 的 10 项旧失败均已修复
- [x] UI 测试 48/48；P2 核心组件及 P4 PageState 分支覆盖率 94.93%
- [x] TypeScript、生产构建及 lint 通过（保留 2 项既有警告）
- [x] 13 个最终自动无障碍检查 100 分，33 个响应式组合无横向溢出
- [x] 注册、选片、修图三页各 3 次最终性能测量，中位数均为 100
- [x] 生产包较 P3 增长 0.61%，较原始基线增长 2.92%
- [x] 截图、组件指南、迁移与验收文档更新

**验收边界：** 使用合成 API 和测试数据；真实后端端到端与实际屏幕阅读器仍待 Phase 5。P3 粒子文档性能门槛未关闭。参见 [P4 报告](docs/design-system-phase-4.md)。

### Phase 5: 全系统验收（1 周）
**目标：** 验证设计系统一致性和完整性

**状态：** 验收已执行，NOT_ACCEPTED；证据见 [P5 报告](docs/design-system-phase-5.md)。

**任务：**
- [x] 视觉与响应式复核（15 页 × 3 个宽度无横向溢出，截图留档）
- [x] 交互复核（真实登录、预约、认证下载及嵌套 Modal；完整业务链仍有已知阻断）
- [ ] 无障碍测试（16 项自动审计通过，真实读屏听读待完成）
- [x] 普通动效性能与基线对比（三次中位数 97；减少动态效果模式仅单次 87，尚未重复验收）
- [x] 文档完善（组件/令牌入口、验收报告、机器结果、人工读屏清单）
- [ ] 全系统门禁通过（真实 API 两项归属校验失败、UI 流程衔接待修复、人工读屏待执行）

**产出：**
- ✅ 验收测试报告
- ✅ 完整的设计系统文档
- ✅ 性能优化报告
- ✅ 已知问题清单

**总时长：** 9-10 周

---

## 12. 成功标准

### 12.1 设计系统完整性

- [ ] 所有设计令牌定义完整（颜色、排版、空间、视觉、动效）
- [ ] 所有场景规则明确（品牌展示、业务工作区、图像处理）
- [ ] 所有核心组件实现完整（Toast、Modal、Spinner、Empty State）
- [ ] 所有组件有完整的 TypeScript 类型定义
- [ ] 所有组件有使用文档和示例

### 12.2 视觉一致性

- [ ] 所有页面使用统一的设计令牌（无硬编码色值、字号、间距）
- [ ] 所有按钮使用统一的 Button 组件（无内联样式）
- [ ] 所有表单使用统一的 Input/Select/Textarea 组件（无样式覆盖）
- [ ] 所有状态徽章使用统一的 StatusBadge 组件
- [ ] 所有空状态使用统一的 Empty State 组件

### 12.3 交互一致性

- [ ] 所有加载状态使用统一的 Spinner 组件（无文字替代）
- [ ] 所有消息提示使用统一的 Toast 系统（可选，不强制）
- [ ] 所有确认操作使用统一的 Modal 组件（可选，不强制）
- [ ] 所有动效时长和缓动曲线统一

**注意：** 路由跳转方式统一（不使用 `window.location.href`）属于技术债务，非 Design System 核心标准

### 12.4 代码质量（硬性门槛）

- [ ] TypeScript 类型检查通过（`tsc --noEmit`）
- [ ] ESLint 无错误（警告可接受）
- [ ] 生产构建成功（`vite build`）
- [ ] 单元测试覆盖率 > 70%（核心组件）
- [ ] 无控制台错误或警告

### 12.5 性能标准（基于基线的相对标准）

**硬性门槛：**
- [ ] 核心业务流程未被破坏

**优化目标：**
- [ ] Lighthouse 性能评分不低于基线 -5 分
- [ ] 首屏加载时间不超过基线 +20%
- [ ] 粒子主页动画平均帧率不低于基线 -10fps
- [ ] 生产构建体积不超过基线 +10%

**说明：** 具体数值在 Phase 1 开始前建立基线后确定

### 12.6 无障碍标准

- [ ] 键盘导航完整（Tab、Enter、ESC）
- [ ] 焦点样式清晰可见
- [ ] 颜色对比度符合 WCAG AA（WebAIM Contrast Checker 验证）
- [ ] 主要组件有 ARIA 标签
- [ ] 支持 reduced-motion（UI 动效 + 粒子动画降级）

---

## 13. 后续规划

### 短期（Phase 5 完成后）

**技术债务清理：**
- 移除 Ant Design 依赖（如验证未使用）
- 补充缺失的 ARIA 标签
- 优化图片加载（懒加载、缩略图）

**组件库完善：**
- 新增中等优先级组件（Drawer、Tabs、Checkbox、Radio、Switch、Progress）
- 建立 Storybook 文档站点
- 编写组件最佳实践指南

### 中期（3-6 个月）

**暗色模式：**
- 设计暗色主题色彩方案
- 实现主题切换机制
- 迁移所有页面支持暗色模式

**业务功能增强：**
- 照片预览和缩略图
- 批量操作功能
- 筛选排序功能
- 上传体验优化

**性能优化：**
- 代码分割和懒加载
- 虚拟滚动（大列表）
- Service Worker 和离线支持

### 长期（6-12 个月）

**多端适配：**
- 移动端 App（React Native / PWA）
- iPad 专属布局
- 桌面端 App（Electron）

**国际化：**
- i18n 多语言支持
- 时区和日期格式
- 货币和单位转换

**高级特性：**
- 实时协作（WebSocket）
- 离线编辑和同步
- 高级图像处理工具

---

## 14. 附录

### 14.1 设计令牌完整清单

**文件位置：** `frontend/src/index.css`

**扩展后的令牌总数：**
- 颜色令牌：40+
- 排版令牌：20+
- 空间令牌：12
- 视觉令牌：10+
- 动效令牌：8
- Z-index 令牌：6

**总计：** 约 100 个设计令牌

### 14.2 组件清单

**现有组件（11 个）：**
- Button, Input, Select, Textarea
- Card, Badge, StatusBadge
- ListGroup, ListItem
- LargeTitle, SectionHeader

**新增组件（Phase 2-3，4 个）：**
- Toast, Modal, Spinner, Empty State

**后续组件（Phase 4+，9 个）：**
- Drawer, Tabs, Checkbox, Radio, Switch
- Progress, Tooltip, Avatar, Breadcrumb

**总计：** 24 个组件

### 14.3 页面清单

**公共页面（4 个）：**
- LandingPage, NotFoundPage
- LoginPage, RegisterPage

**摄影师端（6 个）：**
- DashboardPage, OrdersPage, OrderDetailPage
- UploadPage, AnalysisResultPage, RetouchPage

**客户端（4 个）：**
- ClientPage, BookingPage
- SelectionPage, DeliveryPage

**共享页面（2 个）：**
- BookingDetailPage
- RetouchPage（共享）

**总计：** 16 个页面

### 14.4 参考资源

**设计规范：**
- [iOS Human Interface Guidelines - Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [iOS Human Interface Guidelines - Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [iOS Human Interface Guidelines - Layout](https://developer.apple.com/design/human-interface-guidelines/layout)

**技术文档：**
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [React Router v7 Documentation](https://reactrouter.com/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [TanStack Query Documentation](https://tanstack.com/query/latest)

**无障碍标准：**
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

**测试工具：**
- [Chrome Lighthouse](https://developer.chrome.com/docs/lighthouse)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

## 文档修订历史

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| v1.0 | 2026-10-15 | 初始审计报告 |
| v1.1 | 2026-10-16 | 基于用户反馈修订：明确跨场景设计系统定义，区分已验证事实和设计推断，分离设计系统工作与业务功能开发 |
| v1.2 | 2026-10-16 | 最终修订：<br/>1. 重新定义品牌色职责（`brand-primary` 粒子蓝灰，`action-primary` iOS 蓝）并补充对比度要求<br/>2. 统一 Phase 定义（消除第 6/9 节冲突），明确技术债务不纳入首轮实施<br/>3. 规范验证状态（区分"已检查源码"/"待实施验证"/"已通过测试"）<br/>4. 修订 reduced-motion 方案（区分 UI 动效和 Three.js 粒子动画）<br/>5. 建立性能验收基线机制（Phase 1 前测量，Phase 验收时对比）<br/>6. 补充 Tailwind CSS v4 令牌映射规则（`@theme` vs `:root`）<br/>7. 强调保持组件复用与业务边界，不修改 API 和业务逻辑 |

---

**文档状态：** Phase 1–4 已实施，Phase 5 验收报告已完成；全系统尚未验收通过。  
**下一步行动：** 按 P5-01～P5-05 修复后端归属校验和现有 UI 业务链衔接，执行人工读屏清单，复测完整业务链与减少动态效果模式性能后再签收。业务修复按方案独立排期。

---

## 修订摘要（v1.2）

### 关键修订点

**1. 品牌颜色职责重新定义**
- **修订前：** `brand-primary` = iOS 蓝 (#007AFF)，`brand-secondary` = 粒子蓝灰 (#6B7A99)
- **修订后：** `brand-primary` = 粒子蓝灰 (#6B7A99，品牌识别色），`action-primary` = iOS 蓝 (#007AFF，操作色)
- **理由：** 粒子蓝灰是从现有粒子动画提取的品牌色，应作为主品牌色；iOS 蓝作为操作色用于交互元素
- **补充：** 新增对比度要求表（WCAG AA 标准），Phase 1 实施后使用 WebAIM Contrast Checker 验证

**2. Phase 定义统一**
- **修订前：** 第 6 节"首批页面迁移计划"使用"Phase 2"标注试点页面，与第 9 节"实施时间线"的 Phase 定义冲突
- **修订后：** 统一为 5 个 Phase：Phase 1 (Design Tokens) → Phase 2 (核心组件) → Phase 3 (试点页面) → Phase 4 (剩余页面) → Phase 5 (全系统验收)
- **技术债务处理：** 明确订单状态映射抽离、路由跳转重构属于技术债务（B 类），不纳入 Design System 首轮实施（A 类），Phase 2/3 可选处理但非强制

**3. 验证状态规范**
- **修订前：** 混用"已验证"/"待验证"，未区分"检查源码"和"实际测试"
- **修订后：** 统一使用三种状态
  - ✅ **已检查源码** - 确认代码中存在某项实现，但不代表设计决策合理或新令牌已通过测试
  - ⚠️ **待实施验证** - 需在 Phase 实施后通过实际渲染、测试或工具检测验证
  - ✅ **已通过测试** - 已在实际环境中测试并通过验收标准

**4. Reduced-motion 方案修订**
- **修订前：** 全局 CSS 规则设置极短动画时长（0.01ms）处理所有动态效果
- **修订后：** 区分两类动态效果
  - **UI 动效**（CSS transitions/animations）- 使用全局 CSS `@media (prefers-reduced-motion)` 规则
  - **Three.js 粒子动画**（JavaScript 控制）- 需在 `lensflow-v24.html` 中单独检测 `matchMedia` 并实施降级策略（禁用粒子运动或切换简化版本）
- **理由：** 避免全局 CSS 规则干扰 Three.js 动画生命周期和滚动交互

**5. 性能验收基线化**
- **修订前：** 直接设定绝对指标（Lighthouse > 90 分，首屏 < 2s，包体积 < 500KB，帧率 > 50fps）
- **修订后：** 建立性能基线机制
  - Phase 1 开始前测量当前系统性能（Lighthouse、FCP、LCP、包体积、帧率）
  - 验收时基于基线对比（评分不低于基线 -5 分，加载时间不超过基线 +20%，包体积不超过基线 +10%，帧率不低于基线 -10fps）
  - 区分硬性门槛（构建成功、业务流程未破坏）和优化目标（性能相对标准）
- **理由：** 避免使用缺乏基线支持的绝对指标，确保性能劣化可控可追溯

**6. Tailwind CSS v4 令牌映射规则**
- **新增内容：** 第 6 节"Tailwind CSS v4 令牌映射规则"
  - 明确 `@theme` 用于需要生成工具类的令牌（颜色、间距、字号、圆角）
  - 明确 `:root` 用于仅在组件内通过 `var()` 使用的令牌（动效、阴影、z-index）
  - 提供令牌验证清单（Phase 1 执行）：构建验证、工具类生成验证、向后兼容验证
- **理由：** 确保 Phase 1 实施时正确使用 Tailwind CSS v4 的 `@theme` 机制

**7. 保持组件复用与业务边界**
- **强调内容：** 第 8.2 节"识别的技术债务与处理策略"新增"重要原则"
  - Design System 工作（A 类）不因技术债务（B 类）或业务功能（C 类）而扩大范围
  - 保持当前组件复用与业务边界，不修改 API、不重构权限逻辑、不新增业务功能
  - 任何涉及现有业务行为的改动都应另外排期
- **理由：** 防止 Design System 工作范围蔓延，确保首轮实施聚焦核心目标

### 最终 Phase 定义

| Phase | 名称 | 时长 | 核心目标 | 关键产出 |
|-------|------|------|---------|---------|
| Phase 0 | 审计与准备 | 已完成 | 全面审计，制定方案 | 设计系统方案 v1.2 |
| Phase 1 | Design Tokens | 1 周 | 建立完整设计令牌系统 | 扩展后的 `index.css`（~100 个令牌），性能基线数据 |
| Phase 2 | 核心组件 | 2 周 | 增强现有组件，新增核心组件 | Button/Input 增强，Toast/Modal/Spinner/Empty State |
| Phase 3 | 试点页面迁移 | 2 周 | 迁移 3 个代表性页面验证 | LoginPage/DashboardPage/OrdersPage，回归测试报告 |
| Phase 4 | 其余现有页面迁移 | 3-4 周 | 全部页面迁移到新系统 | 所有页面迁移完成，迁移指南 |
| Phase 5 | 全系统验收 | 1 周 | 验证一致性和完整性 | 验收测试报告，性能优化报告，完整文档 |

**总时长：** 9-10 周

### 设计令牌验证清单（Phase 1）

**Phase 1 开始前：**
- [ ] 建立性能基线（Lighthouse、FCP、LCP、包体积、帧率）
- [ ] 记录测试设备、浏览器版本、网络环境

**Phase 1 实施时：**
- [ ] 在 `@theme` 中新增约 60 个令牌（颜色、间距、字号、圆角）
- [ ] 在 `:root` 中新增约 40 个令牌（动效、阴影、z-index）
- [ ] 修订品牌色定义（`brand-primary` 粒子蓝灰，`action-primary` iOS 蓝）
- [ ] 实施 reduced-motion 策略（UI 动效 + 粒子动画降级）

**Phase 1 验收时：**
- [ ] TypeScript 类型检查通过
- [ ] 生产构建成功
- [ ] 所有 `@theme` 令牌生成对应工具类（创建测试组件验证）
- [ ] 现有页面视觉无变化（截图对比：首页、登录页、仪表盘）
- [ ] 性能指标符合优化目标（与基线对比）
- [ ] 对比度验证（WebAIM Contrast Checker）

### 首批验收标准（Phase 3）

**硬性门槛（必须满足）：**
- [ ] TypeScript 编译无错误
- [ ] ESLint 检查无错误（警告可接受）
- [ ] 生产构建成功
- [ ] 单元测试通过
- [ ] 核心业务流程未被破坏（登录、预约、上传等）

**优化目标（基于基线）：**
- [ ] Lighthouse 性能评分不低于基线 -5 分
- [ ] 首屏加载时间不超过基线 +20%
- [ ] 生产包体积不超过基线 +10%
- [ ] 粒子动画平均帧率不低于基线 -10fps

**视觉与交互：**
- [ ] 迁移页面与原页面视觉一致（截图对比）
- [ ] 键盘导航完整（Tab、Enter、ESC）
- [ ] 颜色对比度符合 WCAG AA
- [ ] 支持 reduced-motion（UI 动效 + 粒子动画）
