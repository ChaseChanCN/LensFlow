import { StrictMode, useRef, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

afterEach(() => { cleanup(); document.querySelectorAll('[data-test-background]').forEach((node) => node.remove()); document.body.style.overflow = '' })

function Nested() {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  return <><button onClick={() => setOpen(true)}>启动</button><Modal isOpen={open} onClose={() => setOpen(false)} title="外层"><button onClick={() => setInner(true)}>打开内层</button><Modal isOpen={inner} onClose={() => setInner(false)} title="内层"><button onClick={() => { setOpen(false); setInner(false) }}>关闭全部</button></Modal></Modal></>
}

describe('Modal', () => {
  it('does not render closed dialogs', () => {
    const { container } = render(<Modal isOpen={false} onClose={() => {}}>内容</Modal>)
    expect(container).toBeEmptyDOMElement()
  })
  it('portals to body, moves initial focus, locks scrolling, restores inert state and opener in StrictMode', async () => {
    document.body.style.overflow = 'scroll'
    const background = document.createElement('aside')
    background.dataset.testBackground = ''
    background.setAttribute('inert', 'existing')
    document.body.append(background)
    function Fixture() {
      const [open, setOpen] = useState(false)
      const input = useRef<HTMLInputElement>(null)
      return <><button onClick={() => setOpen(true)}>打开</button><Modal isOpen={open} onClose={() => setOpen(false)} title="编辑" initialFocusRef={input} footer={<button onClick={() => setOpen(false)}>保存</button>}><input aria-label="姓名" ref={input} /></Modal></>
    }
    const { container } = render(<StrictMode><Fixture /></StrictMode>)
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    const dialog = screen.getByRole('dialog', { name: '编辑' })
    expect(container).not.toContainElement(dialog)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('姓名')).toHaveFocus()
    expect(container).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')
    const added = document.createElement('aside')
    added.dataset.testBackground = ''
    await act(async () => { document.body.append(added) })
    expect(added).toHaveAttribute('inert')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('button', { name: '打开' })).toHaveFocus()
    expect(container).not.toHaveAttribute('inert')
    expect(background).toHaveAttribute('inert', 'existing')
    expect(added).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('scroll')
  })
  it('wraps Tab and Shift+Tab while skipping disabled and hidden controls', async () => {
    render(<Modal isOpen onClose={() => {}} title="键盘"><button disabled>禁用</button><div hidden><button>隐藏</button></div><div style={{ display: 'none' }}><button>不可见</button></div><div style={{ visibility: 'hidden' }}><button>透明</button></div><div aria-hidden="true"><button>不可读</button></div><input type="hidden" /><button tabIndex={-1}>跳过</button><button>最后</button></Modal>)
    const close = screen.getByRole('button', { name: '关闭对话框' })
    const last = screen.getByRole('button', { name: '最后' })
    expect(close).toHaveFocus()
    await userEvent.tab()
    expect(last).toHaveFocus()
    await userEvent.tab()
    expect(close).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(last).toHaveFocus()
  })
  it('honors Escape and backdrop settings, closes only on the actual backdrop, and updates callbacks', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Modal isOpen onClose={first} title="设置" closeOnEsc={false} closeOnBackdrop={false}><button>内容</button></Modal>)
    const dialog = screen.getByRole('dialog')
    await userEvent.keyboard('{Escape}')
    fireEvent.click(dialog.parentElement!)
    expect(first).not.toHaveBeenCalled()
    rerender(<Modal isOpen onClose={second} title="设置"><button>内容</button></Modal>)
    fireEvent.click(screen.getByRole('button', { name: '内容' }))
    expect(second).not.toHaveBeenCalled()
    fireEvent.click(dialog.parentElement!)
    await userEvent.keyboard('{Escape}')
    expect(second).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: '关闭对话框' }))
    expect(second).toHaveBeenCalledTimes(3)
  })
  it('closes only the nested top dialog and restores its trigger before restoring the outer trigger', async () => {
    render(<Nested />)
    await userEvent.click(screen.getByRole('button', { name: '启动' }))
    await userEvent.click(screen.getByRole('button', { name: '打开内层' }))
    const outer = screen.getByRole('dialog', { name: '外层' })
    expect(outer.parentElement).toHaveAttribute('inert')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '内层' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开内层' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '启动' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
  it('does not treat IME composition cancellation as a dialog dismissal', () => {
    const close = vi.fn()
    render(<Modal isOpen onClose={close} title="输入"><input aria-label="中文输入" /></Modal>)
    fireEvent.keyDown(screen.getByLabelText('中文输入'), { key: 'Escape', isComposing: true })
    expect(close).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByLabelText('中文输入'), { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
  })
  it('restores the original trigger when parent and child dialogs unmount together', async () => {
    render(<Nested />)
    await userEvent.click(screen.getByRole('button', { name: '启动' }))
    await userEvent.click(screen.getByRole('button', { name: '打开内层' }))
    await userEvent.click(screen.getByRole('button', { name: '关闭全部' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '启动' })).toHaveFocus()
  })
  it('handles simultaneously mounted nested dialogs without the outer stealing focus', () => {
    render(<Modal isOpen onClose={() => {}} title="外层"><Modal isOpen onClose={() => {}} title="内层">内容</Modal></Modal>)
    expect(within(screen.getByRole('dialog', { name: '内层' })).getByRole('button')).toHaveFocus()
  })
  it('supports explicit accessible descriptions and ignores hidden initial focus targets', () => {
    function Fixture() {
      const hidden = useRef<HTMLInputElement>(null)
      return <Modal isOpen onClose={() => {}} role="alertdialog" ariaLabel="确认" ariaDescribedBy="description" size="lg" initialFocusRef={hidden}><p id="description">说明</p><input ref={hidden} hidden /></Modal>
    }
    render(<Fixture />)
    expect(screen.getByRole('alertdialog', { name: '确认' })).toHaveAttribute('aria-describedby', 'description')
    expect(screen.getByRole('button', { name: '关闭对话框' })).toHaveFocus()
  })
  it('contains programmatic focus and falls back to the panel if controls become disabled', () => {
    render(<><button>背景</button><Modal isOpen onClose={() => {}} title="空内容">内容</Modal></>)
    const dialog = screen.getByRole('dialog')
    within(dialog).getByRole('button').setAttribute('disabled', '')
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog).toHaveFocus()
    act(() => screen.getByRole('button', { name: '背景' }).focus())
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Enter' })
  })
  it('uses checked radios as group tab stops and allows contenteditable and positive tab indices', async () => {
    render(<Modal isOpen onClose={() => {}} title="选项" size="sm"><input type="radio" name="group" aria-label="未选" /><input type="radio" name="group" aria-label="已选" defaultChecked /><input type="radio" name="other" aria-label="另一组" /><button tabIndex={1}>优先</button><div contentEditable suppressContentEditableWarning>编辑区</div></Modal>)
    expect(screen.getByRole('button', { name: '优先' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByText('编辑区')).toHaveFocus()
  })
})
