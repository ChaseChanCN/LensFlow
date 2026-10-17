import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toast, ToastViewport } from './Toast'
import { useToastStore } from '@/stores/toast'
import { Modal } from './Modal'

beforeEach(() => { vi.useFakeTimers(); useToastStore.setState({ toasts: [] }) })
afterEach(() => { vi.useRealTimers(); useToastStore.setState({ toasts: [] }) })
const advance = (time: number) => act(() => { vi.advanceTimersByTime(time) })
function add(message: string, duration?: number, onClose?: () => void) {
  let id = ''
  act(() => { id = useToastStore.getState().addToast({ type: 'success', message, duration, onClose }) })
  return id
}

describe('Toast', () => {
  it('creates a portal, stacks messages, and does not reset an earlier timer on store updates', () => {
    const { container } = render(<ToastViewport />)
    expect(document.querySelector('[data-toast-viewport]')).toBeNull()
    add('第一条', 100)
    expect(container).not.toContainElement(screen.getByText('第一条'))
    advance(50)
    add('第二条', 0)
    advance(50)
    expect(screen.queryByText('第一条')).not.toBeInTheDocument()
    expect(screen.getByText('第二条')).toBeInTheDocument()
  })
  it('supports default lifetimes and normalizes invalid durations', () => {
    render(<ToastViewport />)
    add('默认时长')
    add('无效时长', -1)
    advance(2999)
    expect(screen.getAllByRole('status')).toHaveLength(2)
    advance(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('keeps persistent messages and runs onClose exactly once on manual or programmatic dismissal', () => {
    const close = vi.fn()
    const { rerender } = render(<ToastViewport />)
    const id = add('常驻', 0, close)
    advance(10000)
    rerender(<ToastViewport position="bottom" />)
    expect(document.querySelector('[data-toast-viewport="bottom"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }))
    act(() => useToastStore.getState().removeToast(id))
    expect(close).toHaveBeenCalledOnce()
    const other = add('编程关闭', 0, close)
    act(() => useToastStore.getState().removeToast(other))
    expect(close).toHaveBeenCalledTimes(2)
  })
  it('pauses automatic dismissal while hovered or focused, then grants a fresh reading interval', () => {
    render(<ToastViewport />)
    add('请阅读', 100)
    const toast = screen.getByRole('status')
    fireEvent.mouseEnter(toast)
    advance(1000)
    expect(toast).toBeInTheDocument()
    act(() => within(toast).getByRole('button').focus())
    fireEvent.mouseLeave(toast)
    advance(1000)
    expect(toast).toBeInTheDocument()
    act(() => within(toast).getByRole('button').blur())
    advance(100)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it.each(['success', 'warning', 'error', 'info'] as const)('announces %s with appropriate urgency', (type) => {
    render(<Toast id="direct" type={type} message="消息" duration={0} />)
    expect(screen.getByRole(type === 'error' ? 'alert' : 'status')).toHaveAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')
  })
  it('supports standalone lifetime, manual cleanup, and a new toast id', () => {
    const close = vi.fn()
    const { rerender } = render(<Toast id="one" type="info" message="旧消息" duration={10} onClose={close} />)
    advance(10)
    expect(close).toHaveBeenCalledOnce()
    expect(screen.queryByText('旧消息')).not.toBeInTheDocument()
    rerender(<Toast id="two" type="info" message="新消息" duration={NaN} />)
    expect(screen.getByText('新消息')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('新消息')).not.toBeInTheDocument()
  })
  it('keeps notices inside the active modal, then returns them to body when it closes', () => {
    const { rerender } = render(<><Modal isOpen={false} onClose={() => {}} title="编辑">内容</Modal><ToastViewport /></>)
    add('对话框内通知', 0)
    expect(screen.getByRole('status').closest('[data-modal-root]')).toBeNull()
    rerender(<><Modal isOpen onClose={() => {}} title="编辑">内容</Modal><ToastViewport /></>)
    const dialog = screen.getByRole('dialog', { name: '编辑' })
    expect(dialog).toContainElement(screen.getByRole('status'))
    expect(screen.getByRole('status').closest('[inert]')).toBeNull()
    act(() => within(screen.getByRole('status')).getByRole('button').focus())
    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }))
    expect(within(dialog).getByRole('button', { name: '关闭对话框' })).toHaveFocus()
    add('离开后的通知', 0)
    rerender(<><Modal isOpen={false} onClose={() => {}} title="编辑">内容</Modal><ToastViewport /></>)
    expect(screen.getByRole('status').closest('[data-modal-root]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
