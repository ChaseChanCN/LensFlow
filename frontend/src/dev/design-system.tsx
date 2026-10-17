import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Input, Select, Textarea, Spinner, EmptyState, Modal, ToastViewport } from '@/components/ui'
import { useToastStore, type ToastType } from '@/stores/toast'
import '../index.css'

export function Preview() {
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  const [position, setPosition] = useState<'top' | 'bottom'>('top')
  const initialFocus = useRef<HTMLInputElement>(null)
  const notify = (type: ToastType, message: string, duration?: number) => useToastStore.getState().addToast({ type, message, duration })
  return (
    <main className="mx-auto flex max-w-content-lg flex-col gap-8 p-6 text-label">
      <header><h1 className="text-heading-lg font-bold">LensFlow 组件预览</h1><p className="mt-2 text-body-sm text-label-muted">Phase 2 · 使用键盘 Tab、Shift+Tab 和 Escape 检查交互。</p></header>
      <section className="space-y-4 rounded-card bg-surface-primary p-6 shadow-card">
        <h2 className="text-heading-sm font-semibold">按钮与加载状态</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setOpen(true)}>打开对话框</Button>
          <Button variant="tinted" leftIcon={<span>＋</span>}>新增</Button>
          <Button variant="gray">次要操作</Button><Button variant="plain">文字操作</Button><Button variant="destructive">删除</Button>
          <Button loading>正在保存</Button><Button disabled>不可用</Button>
        </div>
        <div className="flex items-center gap-4"><Spinner size="sm" /><Spinner /><Spinner size="lg" color="gray" /><span className="rounded-card bg-surface-dark-secondary p-3"><Spinner color="white" /></span></div>
      </section>
      <section className="grid gap-6 rounded-card bg-surface-primary p-6 shadow-card md:grid-cols-2">
        <div className="space-y-4"><h2 className="text-heading-sm font-semibold">独立表单</h2><Input label="姓名" placeholder="输入姓名" /><Input label="校验示例" error="请输入有效的邮箱地址" defaultValue="example" /><Select label="拍摄类型"><option>人像</option><option>产品</option></Select><Textarea label="备注" rows={3} /></div>
        <div className="space-y-4"><h2 className="text-heading-sm font-semibold">分组表单</h2><div className="divide-y divide-separator-opaque rounded-card bg-surface-secondary"><div className="p-4"><Input label="分组邮箱" variant="grouped" placeholder="name@example.com" /></div><div className="p-4"><Select label="分组类型" variant="grouped"><option>摄影预约</option><option>修图反馈</option></Select></div><div className="p-4"><Textarea label="分组备注" variant="grouped" rows={3} /></div></div></div>
      </section>
      <section className="space-y-4 rounded-card bg-surface-primary p-6 shadow-card">
        <h2 className="text-heading-sm font-semibold">通知</h2>
        <Select label="通知位置" value={position} onChange={(event) => setPosition(event.target.value as 'top' | 'bottom')}><option value="top">顶部</option><option value="bottom">底部</option></Select>
        <div className="flex flex-wrap gap-3">{(['success', 'warning', 'error', 'info'] as const).map((type) => <Button key={type} variant="gray" onClick={() => notify(type, `${type} · 这是一条示例通知`)}>{type} 提示</Button>)}<Button variant="plain" onClick={() => notify('info', '此通知需手动关闭', 0)}>常驻通知</Button></div>
      </section>
      <div className="rounded-card bg-surface-primary shadow-card"><EmptyState title="暂无相册" description="创建第一本相册，开始整理你的摄影作品。" action={{ label: '创建相册', onClick: () => setOpen(true) }} /></div>
      <Modal isOpen={open} onClose={() => { setOpen(false); setNested(false) }} title="创建相册" initialFocusRef={initialFocus} footer={<><Button variant="gray" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => { setOpen(false); notify('success', '示例相册已创建') }}>保存</Button></>}>
        <div className="space-y-4"><Input ref={initialFocus} label="相册名称" /><div className="flex flex-wrap gap-3"><Button variant="tinted" onClick={() => setNested(true)}>打开嵌套对话框</Button><Button variant="gray" onClick={() => notify('info', '对话框中的通知', 0)}>对话框内提示</Button></div></div>
        <Modal isOpen={nested} onClose={() => setNested(false)} title="确认操作" size="sm" footer={<Button onClick={() => setNested(false)}>确认</Button>}><p>关闭后焦点回到外层的触发按钮。</p></Modal>
      </Modal>
      <ToastViewport position={position} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
