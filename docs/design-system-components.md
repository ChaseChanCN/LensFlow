# Phase 2 核心组件

全部组件从 `frontend/src/components/ui` 导出。设计令牌及颜色职责见 [Design Tokens](design-tokens.md)。交互预览通过开发服务器的 `/design-system.html` 打开；该页面不加入生产应用路由。

## Button

保留 `filled / tinted / gray / plain / destructive`、`sm / md / lg`、`fullWidth` 及原生按钮属性，新增 `loading`、`leftIcon`、`rightIcon`。

```tsx
<Button type="submit" loading={saving}>保存</Button>
<Button type="button" variant="tinted" leftIcon={<PlusIcon />} onClick={createOrder}>
  新增订单
</Button>
```

加载时保留原内容占位和无障碍名称、设置 `aria-busy`，禁用按钮并显示装饰性 Spinner；图标不重复加入名称。普通操作显式使用 `type="button"`，表单提交使用 `type="submit"`，原有原生默认行为保持兼容。

普通字号的 filled/plain 使用深色操作令牌；tinted 使用不透明 `info-bg` / `info-label`，避免在灰色页面背景上混色后对比度不足；destructive 使用 `error-label`。键盘焦点使用可见轮廓；减少动态效果时取消按下缩放。

## Input / Select / Textarea

三种控件均支持 `variant="default" | "grouped"`、`label`、`error`、原生属性和 DOM ref。

```tsx
<Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} />
<Input variant="grouped" label="邮箱" type="email" error={errors.email} />
<Select variant="grouped" label="拍摄类型"><option value="portrait">人像</option></Select>
<Textarea variant="grouped" label="备注" rows={3} />
```

`default` 提供独立边框和内边距，`grouped` 使用透明背景、无边框、零内边距，由分组容器负责行间分隔与外层 padding。两者都有键盘焦点轮廓与错误提示。

标签自动关联 `id`；优先使用调用方 id，其次 name，均缺省时生成唯一 id。错误文字有自己的 id，并追加到 `aria-describedby`，不会覆盖调用方的帮助文字；存在错误时设置 `aria-invalid="true"`。必读标签、占位符和错误文字使用可读的颜色令牌。

本阶段提供组件能力。Login/Register/Booking 等页面中的旧样式覆盖将在 Phase 3 迁移时替换为 grouped。

## Spinner

```tsx
<Spinner />
<Spinner size="sm" color="white" label="上传中" />
<Spinner color="current" decorative />
```

尺寸支持 sm/md/lg，颜色支持 primary/white/gray/current。默认 `role="status"`、名称“加载中”；已有父级说明时使用 `decorative` 避免重复播报。CSS 旋转尊重 reduced-motion。

## EmptyState

```tsx
<EmptyState
  title="暂无订单"
  description="确认预约后，订单会显示在这里。"
  icon={<AlbumIcon />}
  action={{ label: '查看预约', onClick: openBookings }}
/>
```

只传 title 也可使用；默认图标、自定义装饰图标、说明与操作按钮均独立处理。操作按钮不会隐式提交外层表单。

## Toast / ToastViewport

应用根部已挂载一个 `ToastViewport`。通知队列由 Zustand 管理，页面和非组件模块都可调用：

```tsx
import { useToastStore } from '@/stores/toast'

const id = useToastStore.getState().addToast({
  type: 'success', // success | warning | error | info
  message: '保存成功',
  duration: 3000,
  onClose: () => {},
})
useToastStore.getState().removeToast(id)
```

默认 3000ms 消失，`duration: 0` 常驻；非法时长回退到默认值。鼠标悬停或焦点位于通知内时暂停，离开后给予完整的阅读时长。手动关闭、自动消失或队列删除只触发一次 onClose。独立通知也可使用 `<Toast id="..." type="info" message="..." />`。

`<ToastViewport position="top" />` 支持 top/bottom，使用 Portal 堆叠显示。应用里只挂载一个 viewport。错误通知使用 `role="alert"` / assertive，其余使用 status / polite。

存在活动 Modal 时，通知 Portal 自动移入最上层对话框，使通知保持可播报、可关闭并参与该对话框的焦点顺序。关闭具有焦点的通知后，焦点回到对话框中的适当控件；关闭 Modal 后仍未消失的通知返回页面层。

## Modal

```tsx
const input = useRef<HTMLInputElement>(null)
<Modal
  isOpen={open}
  onClose={() => setOpen(false)}
  title="创建相册"
  initialFocusRef={input}
  footer={<Button type="button" onClick={save}>保存</Button>}
>
  <Input ref={input} label="相册名称" />
</Modal>
```

受控的 isOpen/onClose 保持调用方拥有关闭决策。size 支持 sm/md/lg，closeOnBackdrop、closeOnEsc 默认 true；始终提供显式关闭按钮。无标题时用 ariaLabel 命名，简单说明可使用 ariaDescribedBy；role 可选 dialog/alertdialog。

Portal 渲染到 body；打开时隔离背景 inert、锁定背景滚动并移动焦点。Tab/Shift+Tab 在可用控件间循环，跳过 disabled、隐藏区域和不参与 tab 的控件，支持单选组。Escape 只关闭最上层；输入法组合输入期间不将 Escape 视为关闭操作。关闭后，在触发元素仍存在时恢复焦点与原有滚动样式。

支持嵌套、同时挂载的嵌套、父子同时关闭，以及打开时新增背景 DOM。对话框内的主要内容区域可滚动，390px 视口验证无横向溢出。

实现遵循 [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) 的焦点与键盘约定。Portal 本身不会自动处理无障碍，参见 [React createPortal](https://react.dev/reference/react-dom/createPortal)。

## 验证结果（2026-10-16）

- P2 组件测试 45/45 通过，包含 P1 ListItem 的既有测试。行覆盖率 100%、语句 97.70%、函数 98.33%、分支 94.84%；完整结果见 [机器结果](design-system-phase-2-results.json)。覆盖率只统计 P2 组件、Modal 管理器和 Toast store，阈值为四项指标均至少 80%。
- 已检查真实浏览器的 Modal 初始焦点、嵌套 Escape、Tab 循环、关闭焦点恢复、Toast 手动关闭及 Modal/Toast 同用。手机视口为 390×844，Modal 宽 358px，无页面横向溢出。
- 开发预览页初始状态 Lighthouse accessibility 得分 100；这不等于业务页面或所有屏幕阅读器场景均已验收。
- 全量前端测试仍存在 P1 已记录的 14 项失败；未扩大到页面业务流程和旧断言迁移。
- TypeScript 与生产构建通过；ESLint 无错误，保留 DarkroomVideoBackground 的 2 项既有警告。令牌编译、12 组推荐颜色对比度、粒子 reduced-motion 检查通过。
- 生产包总计 860,590 bytes，较 P1 的 849,133 bytes 增长 1.35%，较原始基线增长 1.98%。主 JS 为 400,130 bytes，主 CSS 为 34,980 bytes；本阶段未重测页面导航性能。

预览截图：[组件页](design-system-screenshots/phase-2-preview.jpg)、[Modal](design-system-screenshots/phase-2-modal.jpg)、[手机 Modal](design-system-screenshots/phase-2-modal-mobile.jpg)、[Modal 内通知](design-system-screenshots/phase-2-modal-toast.jpg)。

## LoadingState / ErrorState（P4）

页面可使用 `LoadingState label="正在加载照片"` 统一 Spinner 布局，用 `ErrorState title="照片加载失败" onRetry={retry}` 呈现可播报的失败与重试。没有 onRetry 时不显示重试按钮。加载、请求失败、成功但为空分别处理；多个查询各自保留状态。

交互 `ListItem` 新增 `disabled`，传递到原生 button；通过 `aria-busy` 和装饰性 Spinner 表达 pending，防止重复操作。右侧长文字会限制宽度并换行。导航使用 Link/a；需要 Bearer 认证的下载使用 loading Button，经认证 API 获取 Blob 后保存，不能使用不带认证头的直接链接。详见 [P4 迁移指南](design-system-phase-4.md) 及 [P5 验收](design-system-phase-5.md)。

## 本地命令

在 `frontend/` 执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
# 打开 /design-system.html
pnpm test:ui
pnpm test:ui:coverage
pnpm build
pnpm lint
```

npm 用户可用相同名称的 npm scripts；Windows PowerShell 策略限制脚本时使用 `npm.cmd`。Vitest 与 coverage-v8 固定为匹配的 5.0.4，避免 provider 的精确 peer 版本冲突；npm 与 pnpm 两份锁文件均已同步。
