# 03 · 令牌参考

日期：2026-10-18。以下内容由活动源码逐声明提取，数值未按旧设计稿替换。

权威文件：[机器可读令牌](tokens/lensflow-design-tokens.json)。每个条目包含 value、unit、meaning、source（相对仓库路径、起止行、原文和SHA-256）、evidence。纯尺寸保留CSS原文，unit解释该原文单位；不要再拼接一次单位。局部指标及小程序建议使用数值加unit。

## 读取和优先级

当前入口依次加载 index.css → MaterialScope 的 material.css → site.css；页面另载图库/编辑器 CSS。base 是原始字典，materialDark 是 `.lf-material` 默认声明，materialLight 是更高优先级的浅色选择器覆写。浅色块虽然写在默认块之前，选择器优先级更高。effectiveThemes 按此顺序解析 CSS var 别名；不要仅凭文件行序决定胜负。

`#007AFF` 和 `#6B7A99` 都在基础层，但一般 filled 按钮由 site.css:14-16 改为 mat-control 底色、mat-button-text 文案和 mat-button-border 边框。实际画布为 #323232，不能将 surface-neutral 的 #F5F5F5 当作图库最终背景。

## 当前关键主题配对

| 语义 | 浅色最终变量 | 深色最终变量 | 来源变量 |
|---|---|---|---|
| 页面 | `#f5f4f0` | `#101217` | `--mat-page` |
| 面板 | `#fffefa` | `#171a21` | `--mat-panel` |
| 控件 | `#efeee9` | `#20252f` | `--mat-control` |
| 主文字 | `#202b3b` | `#f0f1f3` | `--mat-text` |
| 次文字 | `#596577` | `#a0a8b7` | `--mat-muted` |
| 分隔线 | `#d8dcdf` | `#2b303a` | `--mat-line` |
| 面板边界 | `#c5ccd4` | `#343c49` | `--mat-border` |
| 强调／链接 | `#435f88` | `#b5c8e7` | `--mat-accent` |
| 按钮文字 | `#202b3b` | `#edf2fa` | `--mat-button-text` |
| 按钮边界 | `#8796ab` | `#7586a0` | `--mat-button-border` |
| 按钮悬停 | `#e2e7ee` | `#2a3341` | `--mat-button-hover` |
| 焦点 | `#365d98` | `#a8c7f5` | `--mat-focus` |
| 成功底色 | `#e4f3e9` | `#182e25` | `--color-success-bg` |
| 成功文字 | `#21643b` | `#9dd7b2` | `--color-success-label` |
| 警告底色 | `#f6ecd9` | `#332a1b` | `--color-warning-bg` |
| 警告文字 | `#79500d` | `#e7c48e` | `--color-warning-label` |
| 错误底色 | `#fae6e5` | `#371f26` | `--color-error-bg` |
| 错误文字 | `#a42a26` | `#ffb4b0` | `--color-error-label` |
| 信息底色 | `#e4edf8` | `#202e44` | `--color-info-bg` |
| 信息文字 | `#315780` | `#b5d0fa` | `--color-info-label` |

## 基础排版与测量解释

字体均为系统栈，没有发现活动React路径中的远程字体加载或独立图标库导入。系统栈声明 SF Pro 不保证设备已装该字体，中文由系统回退；小程序不应打包未获授权字体。基础标题36/30/24/20px，正文18/16/14px、说明12px；当前业务页实际覆盖为44px/500/1.25/-1.8px，Web窄屏35px。数字使用tabular-nums；统计卡片58px、350字重。基础4px节奏有明确声明，但当前局部也有18/22/26px，不应声称全站均为4的倍数。

普通UI过渡100/150/200/300/400ms均有声明，Button实际150ms、按下缩放0.97；不能由令牌存在推定每一状态已实现。没有发现统一路由转场规范，故不导出精确导航转场时间。基础阴影卡片值被 Material 的 none 覆盖；Modal保留独立阴影，品牌/照片/业务几何各不相同。

## 基础已加载声明

证据均为 VERIFIED_SOURCE；基础值可能被后层覆盖。

| 标识 | 原始值 | 单位 | 含义 | 源码行 |
|---|---|---|---|---|
| `--font-sans` | `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif` | 不适用／复合CSS | 界面系统无衬线字体栈；中文依赖系统回退 | `frontend/src/index.css:7` |
| `--font-mono` | `"SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` | 不适用／复合CSS | 编号与英文眉题等宽字体栈 | `frontend/src/index.css:8` |
| `--font-numeric` | `"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif` | 不适用／复合CSS | 数字展示字体栈 | `frontend/src/index.css:9` |
| `--text-display-xl` | `64px` | px | 字号／展示／特大 | `frontend/src/index.css:10` |
| `--text-display-lg` | `48px` | px | 字号／展示／大 | `frontend/src/index.css:11` |
| `--text-heading-xl` | `36px` | px | 字号／标题／特大 | `frontend/src/index.css:12` |
| `--text-heading-lg` | `30px` | px | 字号／标题／大 | `frontend/src/index.css:13` |
| `--text-heading-md` | `24px` | px | 字号／标题／中 | `frontend/src/index.css:14` |
| `--text-heading-sm` | `20px` | px | 字号／标题／小 | `frontend/src/index.css:15` |
| `--text-body-lg` | `18px` | px | 字号／正文／大 | `frontend/src/index.css:16` |
| `--text-body` | `16px` | px | 字号／正文 | `frontend/src/index.css:17` |
| `--text-body-sm` | `14px` | px | 字号／正文／小 | `frontend/src/index.css:18` |
| `--text-caption` | `12px` | px | 字号／辅助说明 | `frontend/src/index.css:19` |
| `--text-form-label` | `14px` | px | 字号／表单／标签 | `frontend/src/index.css:20` |
| `--text-numeric-lg` | `32px` | px | 字号／数字／大 | `frontend/src/index.css:21` |
| `--text-numeric` | `24px` | px | 字号／数字 | `frontend/src/index.css:22` |
| `--font-weight-regular` | `400` | unitless | font／字重／常规 | `frontend/src/index.css:23` |
| `--font-weight-medium` | `500` | unitless | font／字重／中等 | `frontend/src/index.css:24` |
| `--font-weight-semibold` | `600` | unitless | font／字重／半粗 | `frontend/src/index.css:25` |
| `--font-weight-bold` | `700` | unitless | font／字重／粗 | `frontend/src/index.css:26` |
| `--leading-tight` | `1.25` | unitless | 行高／紧凑 | `frontend/src/index.css:27` |
| `--leading-normal` | `1.5` | unitless | 行高／常规 | `frontend/src/index.css:28` |
| `--leading-relaxed` | `1.75` | unitless | 行高／宽松 | `frontend/src/index.css:29` |
| `--color-brand-primary` | `#6B7A99` | 不适用／复合CSS | 基础品牌装饰蓝灰，不等同当前主题主按钮底色 | `frontend/src/index.css:32` |
| `--color-brand-primary-hover` | `#5A6885` | 不适用／复合CSS | 颜色／品牌／主／悬停 | `frontend/src/index.css:33` |
| `--color-brand-primary-pressed` | `#495670` | 不适用／复合CSS | 颜色／品牌／主／按下 | `frontend/src/index.css:34` |
| `--color-action-primary` | `#007AFF` | 不适用／复合CSS | 保留的基础操作蓝；不代表 Material filled 按钮当前底色 | `frontend/src/index.css:35` |
| `--color-action-primary-hover` | `#0066D6` | 不适用／复合CSS | 颜色／操作／主／悬停 | `frontend/src/index.css:36` |
| `--color-action-primary-pressed` | `#0040A0` | 不适用／复合CSS | 颜色／操作／主／按下 | `frontend/src/index.css:37` |
| `--color-action-primary-strong` | `#0066D6` | 不适用／复合CSS | 基础高对比操作色，在 Material 内映射到主题强调色 | `frontend/src/index.css:39` |
| `--color-brand-darkroom` | `#000000` | 不适用／复合CSS | 颜色／品牌／品牌暗房 | `frontend/src/index.css:40` |
| `--color-brand-darkroom-overlay` | `rgba(0, 0, 0, 0.8)` | 不适用／复合CSS | 颜色／品牌／品牌暗房／遮罩 | `frontend/src/index.css:41` |
| `--color-accent` | `#007AFF` | 不适用／复合CSS | 颜色／兼容强调色 | `frontend/src/index.css:42` |
| `--color-accent-hover` | `#0066D6` | 不适用／复合CSS | 颜色／兼容强调色／悬停 | `frontend/src/index.css:43` |
| `--color-accent-pressed` | `#0040A0` | 不适用／复合CSS | 颜色／兼容强调色／按下 | `frontend/src/index.css:44` |
| `--color-label` | `#1C1C1E` | 不适用／复合CSS | 主文字 | `frontend/src/index.css:47` |
| `--color-label-muted` | `#63636A` | 不适用／复合CSS | 次文字 | `frontend/src/index.css:48` |
| `--color-label-secondary` | `rgba(60, 60, 67, 0.6)` | 不适用／复合CSS | 次级文字 | `frontend/src/index.css:49` |
| `--color-label-tertiary` | `rgba(60, 60, 67, 0.3)` | 不适用／复合CSS | 三级文字，不可默认承载必读信息 | `frontend/src/index.css:50` |
| `--color-label-quaternary` | `rgba(60, 60, 67, 0.18)` | 不适用／复合CSS | 最弱文字层级 | `frontend/src/index.css:51` |
| `--color-label-inverse` | `#FFFFFF` | 不适用／复合CSS | 反色文字，Material 中映射到页面底色 | `frontend/src/index.css:52` |
| `--color-label-inverse-secondary` | `rgba(255, 255, 255, 0.6)` | 不适用／复合CSS | 颜色／标签／反色／次 | `frontend/src/index.css:53` |
| `--color-label-inverse-tertiary` | `rgba(255, 255, 255, 0.3)` | 不适用／复合CSS | 颜色／标签／反色／三级 | `frontend/src/index.css:54` |
| `--color-success` | `#34C759` | 不适用／复合CSS | 颜色／成功 | `frontend/src/index.css:55` |
| `--color-success-bg` | `#E8F8ED` | 不适用／复合CSS | 颜色／成功／底色 | `frontend/src/index.css:56` |
| `--color-success-border` | `#A3E4B8` | 不适用／复合CSS | 颜色／成功／边界 | `frontend/src/index.css:57` |
| `--color-success-label` | `#187A33` | 不适用／复合CSS | 颜色／成功／标签 | `frontend/src/index.css:58` |
| `--color-warning` | `#FF9500` | 不适用／复合CSS | 颜色／警告 | `frontend/src/index.css:59` |
| `--color-warning-bg` | `#FFF4E5` | 不适用／复合CSS | 颜色／警告／底色 | `frontend/src/index.css:60` |
| `--color-warning-border` | `#FFD699` | 不适用／复合CSS | 颜色／警告／边界 | `frontend/src/index.css:61` |
| `--color-warning-label` | `#8A4B00` | 不适用／复合CSS | 颜色／警告／标签 | `frontend/src/index.css:62` |
| `--color-error` | `#FF3B30` | 不适用／复合CSS | 颜色／错误 | `frontend/src/index.css:63` |
| `--color-error-bg` | `#FFEBEE` | 不适用／复合CSS | 颜色／错误／底色 | `frontend/src/index.css:64` |
| `--color-error-border` | `#FF9B96` | 不适用／复合CSS | 颜色／错误／边界 | `frontend/src/index.css:65` |
| `--color-error-label` | `#B42318` | 不适用／复合CSS | 颜色／错误／标签 | `frontend/src/index.css:66` |
| `--color-info` | `#007AFF` | 不适用／复合CSS | 颜色／信息 | `frontend/src/index.css:67` |
| `--color-info-bg` | `#E5F2FF` | 不适用／复合CSS | 颜色／信息／底色 | `frontend/src/index.css:68` |
| `--color-info-border` | `#99CCFF` | 不适用／复合CSS | 颜色／信息／边界 | `frontend/src/index.css:69` |
| `--color-info-label` | `#0066D6` | 不适用／复合CSS | 颜色／信息／标签 | `frontend/src/index.css:70` |
| `--color-surface-primary` | `#FFFFFF` | 不适用／复合CSS | 主表面 | `frontend/src/index.css:73` |
| `--color-surface-secondary` | `#F2F2F7` | 不适用／复合CSS | 次表面／页面层 | `frontend/src/index.css:74` |
| `--color-surface-tertiary` | `#FFFFFF` | 不适用／复合CSS | 三级表面 | `frontend/src/index.css:75` |
| `--color-surface-grouped` | `#F2F2F7` | 不适用／复合CSS | 分组页面底色 | `frontend/src/index.css:76` |
| `--color-surface-dark-primary` | `#000000` | 不适用／复合CSS | 颜色／表面／深色／主 | `frontend/src/index.css:77` |
| `--color-surface-dark-secondary` | `#1C1C1E` | 不适用／复合CSS | 颜色／表面／深色／次 | `frontend/src/index.css:78` |
| `--color-surface-dark-tertiary` | `#2C2C2E` | 不适用／复合CSS | 颜色／表面／深色／三级 | `frontend/src/index.css:79` |
| `--color-surface-neutral` | `#F5F5F5` | 不适用／复合CSS | 基础中性图片表面；图库实际图像区另用 #323232 | `frontend/src/index.css:80` |
| `--color-surface-neutral-dark` | `#E0E0E0` | 不适用／复合CSS | 历史命名的灰色中性表面，数值不代表实际深色画布 | `frontend/src/index.css:81` |
| `--color-system-bg` | `#FFFFFF` | 不适用／复合CSS | 颜色／系统／底色 | `frontend/src/index.css:82` |
| `--color-system-bg-secondary` | `#F2F2F7` | 不适用／复合CSS | 颜色／系统／底色／次 | `frontend/src/index.css:83` |
| `--color-system-bg-tertiary` | `#FFFFFF` | 不适用／复合CSS | 颜色／系统／底色／三级 | `frontend/src/index.css:84` |
| `--color-system-bg-grouped` | `#F2F2F7` | 不适用／复合CSS | 颜色／系统／底色／分组 | `frontend/src/index.css:85` |
| `--color-fill-primary` | `rgba(120, 120, 128, 0.2)` | 不适用／复合CSS | 颜色／填充／主 | `frontend/src/index.css:86` |
| `--color-fill-secondary` | `rgba(120, 120, 128, 0.16)` | 不适用／复合CSS | 颜色／填充／次 | `frontend/src/index.css:87` |
| `--color-fill-tertiary` | `rgba(120, 120, 128, 0.12)` | 不适用／复合CSS | 颜色／填充／三级 | `frontend/src/index.css:88` |
| `--color-fill-quaternary` | `rgba(120, 120, 128, 0.08)` | 不适用／复合CSS | 颜色／填充／四级 | `frontend/src/index.css:89` |
| `--color-fill-dark-primary` | `rgba(255, 255, 255, 0.1)` | 不适用／复合CSS | 颜色／填充／深色／主 | `frontend/src/index.css:90` |
| `--color-fill-dark-secondary` | `rgba(255, 255, 255, 0.08)` | 不适用／复合CSS | 颜色／填充／深色／次 | `frontend/src/index.css:91` |
| `--color-fill-dark-tertiary` | `rgba(255, 255, 255, 0.05)` | 不适用／复合CSS | 颜色／填充／深色／三级 | `frontend/src/index.css:92` |
| `--color-system-fill` | `rgba(120, 120, 128, 0.2)` | 不适用／复合CSS | 颜色／系统／填充 | `frontend/src/index.css:93` |
| `--color-system-fill-secondary` | `rgba(120, 120, 128, 0.16)` | 不适用／复合CSS | 颜色／系统／填充／次 | `frontend/src/index.css:94` |
| `--color-system-fill-tertiary` | `rgba(120, 120, 128, 0.12)` | 不适用／复合CSS | 颜色／系统／填充／三级 | `frontend/src/index.css:95` |
| `--color-separator` | `rgba(60, 60, 67, 0.29)` | 不适用／复合CSS | 颜色／分隔线 | `frontend/src/index.css:96` |
| `--color-separator-opaque` | `#C6C6C8` | 不适用／复合CSS | 颜色／分隔线／不透明 | `frontend/src/index.css:97` |
| `--color-separator-dark` | `rgba(255, 255, 255, 0.15)` | 不适用／复合CSS | 颜色／分隔线／深色 | `frontend/src/index.css:98` |
| `--color-separator-dark-opaque` | `#3A3A3C` | 不适用／复合CSS | 颜色／分隔线／深色／不透明 | `frontend/src/index.css:99` |
| `--color-focus-ring` | `rgba(0, 122, 255, 0.25)` | 不适用／复合CSS | 颜色／焦点／轮廓 | `frontend/src/index.css:100` |
| `--spacing-1` | `4px` | px | 间距／1 | `frontend/src/index.css:103` |
| `--spacing-2` | `8px` | px | 间距／2 | `frontend/src/index.css:104` |
| `--spacing-3` | `12px` | px | 间距／3 | `frontend/src/index.css:105` |
| `--spacing-4` | `16px` | px | 间距／4 | `frontend/src/index.css:106` |
| `--spacing-5` | `20px` | px | 间距／5 | `frontend/src/index.css:107` |
| `--spacing-6` | `24px` | px | 间距／6 | `frontend/src/index.css:108` |
| `--spacing-8` | `32px` | px | 间距／8 | `frontend/src/index.css:109` |
| `--spacing-10` | `40px` | px | 间距／10 | `frontend/src/index.css:110` |
| `--spacing-12` | `48px` | px | 间距／12 | `frontend/src/index.css:111` |
| `--spacing-16` | `64px` | px | 间距／16 | `frontend/src/index.css:112` |
| `--spacing-20` | `80px` | px | 间距／20 | `frontend/src/index.css:113` |
| `--spacing-24` | `96px` | px | 间距／24 | `frontend/src/index.css:114` |
| `--container-content-sm` | `640px` | px | 容器／内容宽度／小 | `frontend/src/index.css:117` |
| `--container-content-md` | `768px` | px | 容器／内容宽度／中 | `frontend/src/index.css:118` |
| `--container-content-lg` | `1024px` | px | 容器／内容宽度／大 | `frontend/src/index.css:119` |
| `--container-content-xl` | `1280px` | px | 容器／内容宽度／特大 | `frontend/src/index.css:120` |
| `--breakpoint-sm` | `40rem` | rem | 响应式断点／小 | `frontend/src/index.css:121` |
| `--breakpoint-md` | `48rem` | rem | 响应式断点／中 | `frontend/src/index.css:122` |
| `--breakpoint-lg` | `64rem` | rem | 响应式断点／大 | `frontend/src/index.css:123` |
| `--breakpoint-xl` | `80rem` | rem | 响应式断点／特大 | `frontend/src/index.css:124` |
| `--radius-sm` | `8px` | px | 圆角／小 | `frontend/src/index.css:127` |
| `--radius-control` | `10px` | px | 圆角／控件 | `frontend/src/index.css:128` |
| `--radius-card` | `12px` | px | 圆角／卡片 | `frontend/src/index.css:129` |
| `--radius-sheet` | `16px` | px | 圆角／浮层 | `frontend/src/index.css:130` |
| `--radius-full` | `9999px` | px | 圆角／胶囊 | `frontend/src/index.css:131` |
| `--shadow-card` | `0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)` | 不适用／复合CSS | 卡片阴影；Material 内明确清空 | `frontend/src/index.css:134` |
| `--shadow-elevated` | `0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)` | 不适用／复合CSS | 阴影／抬升 | `frontend/src/index.css:135` |
| `--shadow-focused` | `0 0 0 3px rgba(0, 122, 255, 0.25)` | 不适用／复合CSS | 工具类兼容焦点阴影 | `frontend/src/index.css:136` |
| `--shadow-modal` | `0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)` | 不适用／复合CSS | 对话框叠层阴影 | `frontend/src/index.css:141` |
| `--shadow-focus` | `0 0 0 3px var(--color-focus-ring)` | 不适用／复合CSS | 焦点环阴影 | `frontend/src/index.css:142` |
| `--shadow-dark-card` | `0 2px 8px rgba(0, 0, 0, 0.3)` | 不适用／复合CSS | 阴影／深色／卡片 | `frontend/src/index.css:143` |
| `--shadow-dark-elevated` | `0 8px 24px rgba(0, 0, 0, 0.5)` | 不适用／复合CSS | 阴影／深色／抬升 | `frontend/src/index.css:144` |
| `--border-width-thin` | `1px` | px | 边界／宽度／细 | `frontend/src/index.css:146` |
| `--border-width-medium` | `2px` | px | 边界／宽度／中等 | `frontend/src/index.css:147` |
| `--border-width-thick` | `3px` | px | 边界／宽度／粗 | `frontend/src/index.css:148` |
| `--duration-instant` | `100ms` | ms | 动效时长／即时 | `frontend/src/index.css:149` |
| `--duration-fast` | `150ms` | ms | 动效时长／快 | `frontend/src/index.css:150` |
| `--duration-base` | `200ms` | ms | 动效时长／基础 | `frontend/src/index.css:151` |
| `--duration-slow` | `300ms` | ms | 动效时长／慢 | `frontend/src/index.css:152` |
| `--duration-slower` | `400ms` | ms | 动效时长／更慢 | `frontend/src/index.css:153` |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 不适用／复合CSS | 缓动／进入 | `frontend/src/index.css:154` |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | 不适用／复合CSS | 缓动／离开 | `frontend/src/index.css:155` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 不适用／复合CSS | 缓动／进入／离开 | `frontend/src/index.css:156` |
| `--ease-bounce` | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | 不适用／复合CSS | 缓动／回弹 | `frontend/src/index.css:157` |
| `--z-base` | `0` | unitless | 层级／基础 | `frontend/src/index.css:159` |
| `--z-dropdown` | `1000` | unitless | 层级／下拉 | `frontend/src/index.css:160` |
| `--z-sticky` | `1100` | unitless | 层级／吸顶 | `frontend/src/index.css:161` |
| `--z-fixed` | `1200` | unitless | 层级／固定 | `frontend/src/index.css:162` |
| `--z-modal-backdrop` | `2000` | unitless | 层级／对话框／遮罩 | `frontend/src/index.css:163` |
| `--z-modal` | `2100` | unitless | 层级／对话框 | `frontend/src/index.css:164` |
| `--z-popover` | `2200` | unitless | 层级／浮出层 | `frontend/src/index.css:165` |
| `--z-tooltip` | `2300` | unitless | 层级／提示 | `frontend/src/index.css:166` |
| `--z-toast` | `2400` | unitless | 层级／通知 | `frontend/src/index.css:167` |
| `--space-1` | `var(--spacing-1)` | 不适用／复合CSS | 间距别名／1 | `frontend/src/index.css:170` |
| `--space-2` | `var(--spacing-2)` | 不适用／复合CSS | 间距别名／2 | `frontend/src/index.css:171` |
| `--space-3` | `var(--spacing-3)` | 不适用／复合CSS | 间距别名／3 | `frontend/src/index.css:172` |
| `--space-4` | `var(--spacing-4)` | 不适用／复合CSS | 间距别名／4 | `frontend/src/index.css:173` |
| `--space-5` | `var(--spacing-5)` | 不适用／复合CSS | 间距别名／5 | `frontend/src/index.css:174` |
| `--space-6` | `var(--spacing-6)` | 不适用／复合CSS | 间距别名／6 | `frontend/src/index.css:175` |
| `--space-8` | `var(--spacing-8)` | 不适用／复合CSS | 间距别名／8 | `frontend/src/index.css:176` |
| `--space-10` | `var(--spacing-10)` | 不适用／复合CSS | 间距别名／10 | `frontend/src/index.css:177` |
| `--space-12` | `var(--spacing-12)` | 不适用／复合CSS | 间距别名／12 | `frontend/src/index.css:178` |
| `--space-16` | `var(--spacing-16)` | 不适用／复合CSS | 间距别名／16 | `frontend/src/index.css:179` |
| `--space-20` | `var(--spacing-20)` | 不适用／复合CSS | 间距别名／20 | `frontend/src/index.css:180` |
| `--space-24` | `var(--spacing-24)` | 不适用／复合CSS | 间距别名／24 | `frontend/src/index.css:181` |
| `--line-height-tight` | `var(--leading-tight)` | 不适用／复合CSS | 行／高／紧凑 | `frontend/src/index.css:182` |
| `--line-height-normal` | `var(--leading-normal)` | 不适用／复合CSS | 行／高／常规 | `frontend/src/index.css:183` |
| `--line-height-relaxed` | `var(--leading-relaxed)` | 不适用／复合CSS | 行／高／宽松 | `frontend/src/index.css:184` |
| `--text-label` | `var(--text-form-label)` | 不适用／复合CSS | 字号／标签 | `frontend/src/index.css:186` |
| `--width-content-sm` | `var(--container-content-sm)` | 不适用／复合CSS | 宽度／内容宽度／小 | `frontend/src/index.css:187` |
| `--width-content-md` | `var(--container-content-md)` | 不适用／复合CSS | 宽度／内容宽度／中 | `frontend/src/index.css:188` |
| `--width-content-lg` | `var(--container-content-lg)` | 不适用／复合CSS | 宽度／内容宽度／大 | `frontend/src/index.css:189` |
| `--width-content-xl` | `var(--container-content-xl)` | 不适用／复合CSS | 宽度／内容宽度／特大 | `frontend/src/index.css:190` |

## Material 默认深色覆写

证据均为 VERIFIED_SOURCE；基础值可能被后层覆盖。

| 标识 | 原始值 | 单位 | 含义 | 源码行 |
|---|---|---|---|---|
| `--mat-nav` | `#101217f5` | 不适用／复合CSS | Material 半透明导航底色 | `frontend/src/components/material/material.css:21` |
| `--mat-page` | `#101217` | 不适用／复合CSS | Material 页面底色 | `frontend/src/components/material/material.css:22` |
| `--mat-panel` | `#171a21` | 不适用／复合CSS | Material 卡片和面板底色 | `frontend/src/components/material/material.css:23` |
| `--mat-control` | `#20252f` | 不适用／复合CSS | Material 控件底色 | `frontend/src/components/material/material.css:24` |
| `--mat-text` | `#f0f1f3` | 不适用／复合CSS | Material 主文字 | `frontend/src/components/material/material.css:25` |
| `--mat-muted` | `#a0a8b7` | 不适用／复合CSS | Material 次文字 | `frontend/src/components/material/material.css:26` |
| `--mat-line` | `#2b303a` | 不适用／复合CSS | Material 分隔线 | `frontend/src/components/material/material.css:27` |
| `--mat-border` | `#343c49` | 不适用／复合CSS | Material 面板边界 | `frontend/src/components/material/material.css:28` |
| `--mat-accent` | `#b5c8e7` | 不适用／复合CSS | Material 蓝灰强调色；当前链接与选片边界引用来源 | `frontend/src/components/material/material.css:29` |
| `--mat-body` | `#bdc4d0` | 不适用／复合CSS | Material 辅助正文 | `frontend/src/components/material/material.css:30` |
| `--mat-field` | `#b8c4d6` | 不适用／复合CSS | Material 字段标签 | `frontend/src/components/material/material.css:31` |
| `--mat-placeholder` | `#8f9aad` | 不适用／复合CSS | Material 占位文字 | `frontend/src/components/material/material.css:32` |
| `--mat-button-text` | `#edf2fa` | 不适用／复合CSS | Material 主按钮文字 | `frontend/src/components/material/material.css:33` |
| `--mat-button-border` | `#7586a0` | 不适用／复合CSS | Material 主按钮边框 | `frontend/src/components/material/material.css:34` |
| `--mat-button-hover` | `#2a3341` | 不适用／复合CSS | Material 主按钮悬停底色 | `frontend/src/components/material/material.css:35` |
| `--mat-hover` | `#1d222c` | 不适用／复合CSS | Material 卡片悬停底色 | `frontend/src/components/material/material.css:36` |
| `--mat-hover-border` | `#62748f` | 不适用／复合CSS | Material 悬停边框 | `frontend/src/components/material/material.css:37` |
| `--mat-numeric` | `#e8eef7` | 不适用／复合CSS | Material 统计数字 | `frontend/src/components/material/material.css:38` |
| `--mat-nav-text` | `#d6e1f3` | 不适用／复合CSS | Material 当前导航文字 | `frontend/src/components/material/material.css:39` |
| `--mat-nav-active` | `#222a36` | 不适用／复合CSS | Material 当前导航底色 | `frontend/src/components/material/material.css:40` |
| `--mat-nav-border` | `#3d4a5f` | 不适用／复合CSS | Material 当前导航边框 | `frontend/src/components/material/material.css:41` |
| `--mat-focus` | `#a8c7f5` | 不适用／复合CSS | Material 焦点轮廓 | `frontend/src/components/material/material.css:42` |
| `--mat-art` | `#879cbb` | 不适用／复合CSS | Material 装饰线稿 | `frontend/src/components/material/material.css:43` |
| `--mat-tag-border` | `#414d60` | 不适用／复合CSS | Material 标签边界 | `frontend/src/components/material/material.css:44` |
| `--mat-metric` | `#e6ebf5` | 不适用／复合CSS | Material 指标文字 | `frontend/src/components/material/material.css:45` |
| `--mat-skeleton` | `#303947` | 不适用／复合CSS | Material 骨架占位 | `frontend/src/components/material/material.css:46` |
| `--mat-white` | `#fff` | 不适用／复合CSS | Material 悬停文案色；浅色模式并非白色 | `frontend/src/components/material/material.css:47` |
| `--color-label` | `var(--mat-text)` | 不适用／复合CSS | 主文字 | `frontend/src/components/material/material.css:48` |
| `--color-label-muted` | `var(--mat-muted)` | 不适用／复合CSS | 次文字 | `frontend/src/components/material/material.css:48` |
| `--color-label-secondary` | `var(--mat-muted)` | 不适用／复合CSS | 次级文字 | `frontend/src/components/material/material.css:48` |
| `--color-label-tertiary` | `#8793a6` | 不适用／复合CSS | 三级文字，不可默认承载必读信息 | `frontend/src/components/material/material.css:48` |
| `--color-label-quaternary` | `#667386` | 不适用／复合CSS | 最弱文字层级 | `frontend/src/components/material/material.css:48` |
| `--color-label-inverse` | `var(--mat-page)` | 不适用／复合CSS | 反色文字，Material 中映射到页面底色 | `frontend/src/components/material/material.css:49` |
| `--color-label-inverse-secondary` | `#303a49` | 不适用／复合CSS | 颜色／标签／反色／次 | `frontend/src/components/material/material.css:49` |
| `--color-system-bg` | `var(--mat-panel)` | 不适用／复合CSS | 颜色／系统／底色 | `frontend/src/components/material/material.css:50` |
| `--color-system-bg-grouped` | `var(--mat-page)` | 不适用／复合CSS | 颜色／系统／底色／分组 | `frontend/src/components/material/material.css:50` |
| `--color-system-bg-secondary` | `var(--mat-control)` | 不适用／复合CSS | 颜色／系统／底色／次 | `frontend/src/components/material/material.css:50` |
| `--color-system-bg-tertiary` | `var(--mat-control)` | 不适用／复合CSS | 颜色／系统／底色／三级 | `frontend/src/components/material/material.css:50` |
| `--color-surface-primary` | `var(--mat-panel)` | 不适用／复合CSS | 主表面 | `frontend/src/components/material/material.css:51` |
| `--color-surface-secondary` | `var(--mat-page)` | 不适用／复合CSS | 次表面／页面层 | `frontend/src/components/material/material.css:51` |
| `--color-surface-tertiary` | `var(--mat-control)` | 不适用／复合CSS | 三级表面 | `frontend/src/components/material/material.css:51` |
| `--color-surface-grouped` | `var(--mat-page)` | 不适用／复合CSS | 分组页面底色 | `frontend/src/components/material/material.css:51` |
| `--color-system-fill` | `#28313e` | 不适用／复合CSS | 颜色／系统／填充 | `frontend/src/components/material/material.css:52` |
| `--color-system-fill-secondary` | `#313d4e` | 不适用／复合CSS | 颜色／系统／填充／次 | `frontend/src/components/material/material.css:52` |
| `--color-system-fill-tertiary` | `#3d4b60` | 不适用／复合CSS | 颜色／系统／填充／三级 | `frontend/src/components/material/material.css:52` |
| `--color-separator` | `var(--mat-line)` | 不适用／复合CSS | 颜色／分隔线 | `frontend/src/components/material/material.css:53` |
| `--color-separator-opaque` | `var(--mat-border)` | 不适用／复合CSS | 颜色／分隔线／不透明 | `frontend/src/components/material/material.css:53` |
| `--color-action-primary-strong` | `var(--mat-accent)` | 不适用／复合CSS | 基础高对比操作色，在 Material 内映射到主题强调色 | `frontend/src/components/material/material.css:54` |
| `--color-action-primary-pressed` | `#d7e4f8` | 不适用／复合CSS | 颜色／操作／主／按下 | `frontend/src/components/material/material.css:54` |
| `--color-action-primary-hover` | `#c9d9f1` | 不适用／复合CSS | 颜色／操作／主／悬停 | `frontend/src/components/material/material.css:54` |
| `--color-focus-ring` | `var(--mat-focus)` | 不适用／复合CSS | 颜色／焦点／轮廓 | `frontend/src/components/material/material.css:54` |
| `--color-success-bg` | `#182e25` | 不适用／复合CSS | 颜色／成功／底色 | `frontend/src/components/material/material.css:55` |
| `--color-success-label` | `#9dd7b2` | 不适用／复合CSS | 颜色／成功／标签 | `frontend/src/components/material/material.css:55` |
| `--color-success-border` | `#416e54` | 不适用／复合CSS | 颜色／成功／边界 | `frontend/src/components/material/material.css:55` |
| `--color-warning-bg` | `#332a1b` | 不适用／复合CSS | 颜色／警告／底色 | `frontend/src/components/material/material.css:56` |
| `--color-warning-label` | `#e7c48e` | 不适用／复合CSS | 颜色／警告／标签 | `frontend/src/components/material/material.css:56` |
| `--color-warning-border` | `#6e5833` | 不适用／复合CSS | 颜色／警告／边界 | `frontend/src/components/material/material.css:56` |
| `--color-error-bg` | `#371f26` | 不适用／复合CSS | 颜色／错误／底色 | `frontend/src/components/material/material.css:57` |
| `--color-error-label` | `#ffb4b0` | 不适用／复合CSS | 颜色／错误／标签 | `frontend/src/components/material/material.css:57` |
| `--color-error-border` | `#8e5356` | 不适用／复合CSS | 颜色／错误／边界 | `frontend/src/components/material/material.css:57` |
| `--color-info-bg` | `#202e44` | 不适用／复合CSS | 颜色／信息／底色 | `frontend/src/components/material/material.css:58` |
| `--color-info-label` | `#b5d0fa` | 不适用／复合CSS | 颜色／信息／标签 | `frontend/src/components/material/material.css:58` |
| `--color-info-border` | `#536f98` | 不适用／复合CSS | 颜色／信息／边界 | `frontend/src/components/material/material.css:58` |
| `--shadow-card` | `none` | 不适用／复合CSS | 卡片阴影；Material 内明确清空 | `frontend/src/components/material/material.css:59` |

## Material 浅色覆写

证据均为 VERIFIED_SOURCE；基础值可能被后层覆盖。

| 标识 | 原始值 | 单位 | 含义 | 源码行 |
|---|---|---|---|---|
| `--mat-page` | `#f5f4f0` | 不适用／复合CSS | Material 页面底色 | `frontend/src/components/material/material.css:10` |
| `--mat-panel` | `#fffefa` | 不适用／复合CSS | Material 卡片和面板底色 | `frontend/src/components/material/material.css:10` |
| `--mat-control` | `#efeee9` | 不适用／复合CSS | Material 控件底色 | `frontend/src/components/material/material.css:10` |
| `--mat-text` | `#202b3b` | 不适用／复合CSS | Material 主文字 | `frontend/src/components/material/material.css:10` |
| `--mat-muted` | `#596577` | 不适用／复合CSS | Material 次文字 | `frontend/src/components/material/material.css:10` |
| `--mat-line` | `#d8dcdf` | 不适用／复合CSS | Material 分隔线 | `frontend/src/components/material/material.css:10` |
| `--mat-border` | `#c5ccd4` | 不适用／复合CSS | Material 面板边界 | `frontend/src/components/material/material.css:10` |
| `--mat-accent` | `#435f88` | 不适用／复合CSS | Material 蓝灰强调色；当前链接与选片边界引用来源 | `frontend/src/components/material/material.css:10` |
| `--mat-body` | `#455369` | 不适用／复合CSS | Material 辅助正文 | `frontend/src/components/material/material.css:10` |
| `--mat-field` | `#455369` | 不适用／复合CSS | Material 字段标签 | `frontend/src/components/material/material.css:10` |
| `--mat-placeholder` | `#596577` | 不适用／复合CSS | Material 占位文字 | `frontend/src/components/material/material.css:10` |
| `--mat-button-text` | `#202b3b` | 不适用／复合CSS | Material 主按钮文字 | `frontend/src/components/material/material.css:10` |
| `--mat-button-border` | `#8796ab` | 不适用／复合CSS | Material 主按钮边框 | `frontend/src/components/material/material.css:10` |
| `--mat-button-hover` | `#e2e7ee` | 不适用／复合CSS | Material 主按钮悬停底色 | `frontend/src/components/material/material.css:10` |
| `--mat-hover` | `#efeee9` | 不适用／复合CSS | Material 卡片悬停底色 | `frontend/src/components/material/material.css:10` |
| `--mat-hover-border` | `#6b7d99` | 不适用／复合CSS | Material 悬停边框 | `frontend/src/components/material/material.css:10` |
| `--mat-numeric` | `#202b3b` | 不适用／复合CSS | Material 统计数字 | `frontend/src/components/material/material.css:10` |
| `--mat-nav-text` | `#253e61` | 不适用／复合CSS | Material 当前导航文字 | `frontend/src/components/material/material.css:10` |
| `--mat-nav-active` | `#e3e9f2` | 不适用／复合CSS | Material 当前导航底色 | `frontend/src/components/material/material.css:10` |
| `--mat-nav-border` | `#a4b5cc` | 不适用／复合CSS | Material 当前导航边框 | `frontend/src/components/material/material.css:10` |
| `--mat-focus` | `#365d98` | 不适用／复合CSS | Material 焦点轮廓 | `frontend/src/components/material/material.css:10` |
| `--mat-art` | `#637d9f` | 不适用／复合CSS | Material 装饰线稿 | `frontend/src/components/material/material.css:10` |
| `--mat-tag-border` | `#9daec5` | 不适用／复合CSS | Material 标签边界 | `frontend/src/components/material/material.css:10` |
| `--mat-metric` | `#202b3b` | 不适用／复合CSS | Material 指标文字 | `frontend/src/components/material/material.css:10` |
| `--mat-skeleton` | `#d8dee6` | 不适用／复合CSS | Material 骨架占位 | `frontend/src/components/material/material.css:10` |
| `--mat-nav` | `#f5f4f0f5` | 不适用／复合CSS | Material 半透明导航底色 | `frontend/src/components/material/material.css:10` |
| `--mat-white` | `#202b3b` | 不适用／复合CSS | Material 悬停文案色；浅色模式并非白色 | `frontend/src/components/material/material.css:10` |
| `--color-label-secondary` | `#596577` | 不适用／复合CSS | 次级文字 | `frontend/src/components/material/material.css:11` |
| `--color-label-tertiary` | `#637086` | 不适用／复合CSS | 三级文字，不可默认承载必读信息 | `frontend/src/components/material/material.css:11` |
| `--color-label-quaternary` | `#637086` | 不适用／复合CSS | 最弱文字层级 | `frontend/src/components/material/material.css:11` |
| `--color-system-fill` | `#e3e7ed` | 不适用／复合CSS | 颜色／系统／填充 | `frontend/src/components/material/material.css:12` |
| `--color-system-fill-secondary` | `#d8dfe8` | 不适用／复合CSS | 颜色／系统／填充／次 | `frontend/src/components/material/material.css:12` |
| `--color-system-fill-tertiary` | `#cbd5e1` | 不适用／复合CSS | 颜色／系统／填充／三级 | `frontend/src/components/material/material.css:12` |
| `--color-action-primary-pressed` | `#294a76` | 不适用／复合CSS | 颜色／操作／主／按下 | `frontend/src/components/material/material.css:13` |
| `--color-action-primary-hover` | `#36547e` | 不适用／复合CSS | 颜色／操作／主／悬停 | `frontend/src/components/material/material.css:13` |
| `--color-success-bg` | `#e4f3e9` | 不适用／复合CSS | 颜色／成功／底色 | `frontend/src/components/material/material.css:14` |
| `--color-success-label` | `#21643b` | 不适用／复合CSS | 颜色／成功／标签 | `frontend/src/components/material/material.css:14` |
| `--color-success-border` | `#94bca2` | 不适用／复合CSS | 颜色／成功／边界 | `frontend/src/components/material/material.css:14` |
| `--color-warning-bg` | `#f6ecd9` | 不适用／复合CSS | 颜色／警告／底色 | `frontend/src/components/material/material.css:15` |
| `--color-warning-label` | `#79500d` | 不适用／复合CSS | 颜色／警告／标签 | `frontend/src/components/material/material.css:15` |
| `--color-warning-border` | `#c7aa71` | 不适用／复合CSS | 颜色／警告／边界 | `frontend/src/components/material/material.css:15` |
| `--color-error-bg` | `#fae6e5` | 不适用／复合CSS | 颜色／错误／底色 | `frontend/src/components/material/material.css:16` |
| `--color-error-label` | `#a42a26` | 不适用／复合CSS | 颜色／错误／标签 | `frontend/src/components/material/material.css:16` |
| `--color-error-border` | `#cd9693` | 不适用／复合CSS | 颜色／错误／边界 | `frontend/src/components/material/material.css:16` |
| `--color-info-bg` | `#e4edf8` | 不适用／复合CSS | 颜色／信息／底色 | `frontend/src/components/material/material.css:17` |
| `--color-info-label` | `#315780` | 不适用／复合CSS | 颜色／信息／标签 | `frontend/src/components/material/material.css:17` |
| `--color-info-border` | `#94abc7` | 不适用／复合CSS | 颜色／信息／边界 | `frontend/src/components/material/material.css:17` |

## 当前组件局部指标

证据均为 VERIFIED_SOURCE。此层揭示基础变量无法单独表示的最终样式。

| 标识 | 值 | 单位 | 含义 | 源码行 |
|---|---|---|---|---|
| `metric/button.radius` | `999` | px | 当前 Material 通用按钮胶囊圆角 | `frontend/src/components/material/site.css:14` |
| `metric/button.minHeight` | `44` | px | 当前 Material 通用按钮最小高度 | `frontend/src/components/material/site.css:14` |
| `metric/button.loginMinHeight` | `52` | px | 登录主操作最小高度 | `frontend/src/components/material/material.css:150` |
| `metric/card.materialRadius` | `16` | px | Material 通用卡片实际圆角 | `frontend/src/components/material/site.css:8` |
| `metric/card.homeRadius` | `18` | px | 品牌流程卡片圆角 | `frontend/src/components/material/site.css:48` |
| `metric/card.loginRadius` | `20` | px | 登录面板圆角 | `frontend/src/components/material/material.css:142` |
| `metric/heading.desktopSize` | `44` | px | 一般业务页桌面主标题 | `frontend/src/components/material/site.css:3` |
| `metric/heading.desktopWeight` | `500` | unitless | 一般业务页桌面主标题字重 | `frontend/src/components/material/site.css:3` |
| `metric/heading.desktopTracking` | `-1.8` | px | 桌面业务页主标题字距 | `frontend/src/components/material/site.css:3` |
| `metric/heading.mobileWebSize` | `35` | px | Web 窄屏业务页标题，不是小程序建议 | `frontend/src/components/material/site.css:59` |
| `metric/heading.desktopLineHeight` | `1.25` | unitless | 桌面业务页主标题行高倍数 | `frontend/src/components/material/site.css:3` |
| `metric/field.materialText` | `14` | px | 通用输入文字最终 Material 覆写 | `frontend/src/components/material/site.css:18` |
| `metric/navigation.desktopMinHeight` | `88` | px | 工作区桌面导航最小高度 | `frontend/src/components/material/material.css:65` |
| `metric/navigation.narrowMinHeight` | `74` | px | 工作区小于等于720px的导航最小高度 | `frontend/src/components/material/material.css:158` |
| `metric/layout.desktopMaxWidth` | `1264` | px | 工作区桌面主区最大宽度 | `frontend/src/components/material/material.css:69` |
| `metric/layout.desktopPadding` | `32` | px | 工作区桌面主区横向内边距，标题另加16px | `frontend/src/components/material/material.css:69` |
| `metric/list.desktopMinHeight` | `76` | px | Material 分组列表普通 div 行最小高度；button 行不一定匹配此选择器 | `frontend/src/components/material/site.css:9` |
| `metric/list.desktopPadding` | `20px 24px` | 不适用 | Material 分组列表匹配行内边距 | `frontend/src/components/material/site.css:9` |
| `metric/list.mobileWebPadding` | `18` | px | Web 窄屏匹配分组列表行内边距 | `frontend/src/components/material/site.css:70` |
| `metric/photo.canvas` | `#323232` | 不适用 | 实际图库图片周围中性灰，浅深主题都保持 | `frontend/src/components/photo-library/photo-library.css:11` |
| `metric/photo.editorCanvas` | `#323232` | 不适用 | 实际编辑器照片画布周围中性灰 | `frontend/src/components/photo-editor/photo-editor.css:13` |
| `metric/photo.gridGap` | `12` | px | 摄影师虚拟图库网格间隔 | `frontend/src/components/photo-library/photo-library.css:6` |
| `metric/photo.assetRadius` | `5` | px | 摄影师照片卡片圆角，区别于业务卡片 | `frontend/src/components/photo-library/photo-library.css:7` |
| `metric/photo.selectedBorder` | `2` | px | 摄影师照片卡片选择边框厚度 | `frontend/src/components/photo-library/photo-library.css:7` |
| `metric/photo.viewerHeight` | `55` | vh | 摄影师图片预览区高度 | `frontend/src/components/photo-library/photo-library.css:16` |
| `metric/photo.assetOpenHeight` | `28` | px | 最终覆盖后的查看按钮高度，移动端不可照搬 | `frontend/src/components/photo-library/photo-library.css:25` |
| `metric/overlay.material` | `rgb(10 15 23 / .65)` | 不适用 | Material 对话框实际遮罩覆写 | `frontend/src/components/material/site.css:24` |
| `metric/overlay.blur` | `8` | px | Web 对话框背景模糊 | `frontend/src/components/material/site.css:24` |
| `metric/numeric.tabularSize` | `58` | px | 桌面统计数字字号 | `frontend/src/components/material/material.css:87` |
| `metric/numeric.weight` | `350` | unitless | 桌面统计数字细字重 | `frontend/src/components/material/material.css:87` |
| `metric/eyebrow.size` | `10` | px | 品牌英文眉题字号，不能照搬为移动端重要说明 | `frontend/src/components/material/material.css:72` |
| `metric/eyebrow.tracking` | `1.5` | px | 品牌英文眉题字距 | `frontend/src/components/material/material.css:72` |
| `metric/themeToggle.iconSize` | `20` | px | 主题图标尺寸 | `frontend/src/components/material/ThemeToggle.tsx:7` |
| `metric/themeToggle.stroke` | `1.5` | unitless | 24单位图标画布的线宽 | `frontend/src/components/material/ThemeToggle.tsx:7` |
| `metric/toast.defaultDuration` | `3000` | ms | 普通通知默认停留时间，非所有错误的消失规则 | `frontend/src/components/ui/Toast.tsx:16` |

## 小程序适配层

以下全部是 PROPOSED_ADAPTATION，不是当前Web值。以逻辑px作为可读性与热区下限；间距若转为rpx，375px稿中16px=32rpx，但320px屏幕上32rpx只有约13.65px，44px热区不可直接固定为88rpx。字重与行高不乘二；1px边框不变成2px。建议值允许在真机字缩放测试后调整。

| 标识 | 值 | 单位 | 语义与依据 |
|---|---|---|---|
| `mini/page.gutter` | `16` | px | 移动端左右基础留白；延续4px节奏；优先保持窄屏有效图片宽度。 |
| `mini/section.gap` | `24` | px | 主要内容分区间距；分区留白大于行内间隔。 |
| `mini/card.padding` | `16` | px | 客户业务卡片内边距；区别于 Web 桌面24px列表内边距。 |
| `mini/row.gap` | `12` | px | 列表和组件组间距；保留Web 12px节奏。 |
| `mini/touch.min` | `44` | px | 独立交互最小有效触摸区域；可见图标可较小，有效热区至少44px；实机验证。 |
| `mini/button.height` | `48` | px | 移动端主要按钮常规高度；为中文动作和手指操作提供余量。 |
| `mini/button.radius` | `999` | px | 移动端主要和次要按钮胶囊圆角；保持当前Material几何。 |
| `mini/button.text` | `16` | px | 移动端主操作文字；避免桌面小字号照搬。 |
| `mini/field.minHeight` | `48` | px | 移动端普通输入行最小高度；标签及错误文案在输入框外另占空间。 |
| `mini/field.radius` | `10` | px | 独立输入框圆角；保留基础表单几何；分组表单内部用分隔线。 |
| `mini/card.radius` | `16` | px | 移动端业务面板圆角；延续当前Material生效值。 |
| `mini/sheet.radius` | `16` | px | 底部面板顶部圆角；原生对话框由平台绘制，不能强行套用此值。 |
| `mini/title.size` | `28` | px | 常规页面主标题；窄屏标题可换行，保持500字重而缩小桌面44px。 |
| `mini/title.weight` | `500` | unitless | 移动端页面标题字重；延续非粗黑的编辑式标题。 |
| `mini/title.lineHeight` | `1.3` | unitless | 移动端标题行高；中文换行时增加呼吸空间。 |
| `mini/title.tracking` | `0` | px | 移动端中文标题字距；桌面负字距不机械移植到窄屏中文。 |
| `mini/sectionTitle.size` | `20` | px | 移动端区块标题；区块标题弱于页面标题。 |
| `mini/body.size` | `16` | px | 移动端主要正文；支持系统可访问性缩放。 |
| `mini/body.lineHeight` | `1.6` | unitless | 移动端中文正文行高；介于1.5和1.75之间，作为适配提案而非Web事实。 |
| `mini/secondary.size` | `14` | px | 移动端辅助正文；日期、数量、解释信息。 |
| `mini/caption.size` | `12` | px | 移动端非关键图片编号和装饰说明；核心说明不得降至Web眉题9-10px。 |
| `mini/icon.size` | `20` | px | 常用线性图标可见尺寸；沿用24单位图标画布习惯，实际文件由小程序自持。 |
| `mini/icon.stroke` | `1.5` | unitless | 24单位线性图标建议线宽；避免混入不同线重整套图标。 |
| `mini/photo.canvas` | `#323232` | 不适用 | 移动端照片预览中性背景；跨主题保持照片周围中性，不随面板暖白改变。 |
| `mini/photo.gridGap` | `8` | px | 移动端选片缩略图网格间隔；比Web12px更紧凑，留出图片宽度。 |
| `mini/photo.radius` | `5` | px | 移动端照片容器细圆角；容器可圆角，照片内容不得被强制裁切。 |
| `mini/photo.selectedBorder` | `2` | px | 移动端已选照片边界厚度；配合勾选与已选文字，不只用颜色。 |
| `mini/motion.pressDuration` | `100` | ms | 触摸按下反馈时长；取消悬停依赖；减少动态效果时可立即更新。 |
| `mini/motion.transitionDuration` | `150` | ms | 普通状态切换时长；不阻塞选片和返回。 |
| `mini/motion.ease` | `cubic-bezier(0, 0, 0.2, 1)` | 不适用 | 轻量过渡缓动；不引入重动画依赖。 |

## 缺失证据

- UNRESOLVED：小程序最低基础库和WXSS变量能力待目标项目确认；JSON值为null，不产生虚构精确值。
- UNRESOLVED：原生导航和状态栏高度由设备提供，无统一固定设计数值；JSON值为null，不产生虚构精确值。
- UNRESOLVED：已批准可分发的静态品牌肖像资产尚未在本次交付中提供；JSON值为null，不产生虚构精确值。
- UNRESOLVED：价格、可预约日期和时段不是设计审计可推定的数据；JSON值为null，不产生虚构精确值。

计数：271 条源码变量声明（含别名和主题覆写），35 个局部源码指标，共 306 个 VERIFIED_SOURCE 条目；30 个小程序建议；4 个未决值。VERIFIED_RENDER 以[截图索引](07-reference-index.md)为准，不将全部变量自动升级为渲染核验。

相关：[源审计](01-source-audit.md) · [组件规格](04-component-specification.md) · [设计漂移](08-design-drift.md) · [交付入口](README.md)。
