import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_EDITS } from '@/utils/imageEdit'
import { EditorAdjustments } from './EditorAdjustments'
import { ParameterHistory } from './ParameterHistory'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'
vi.mock('@/components/ui', () => ({
  Button: ({ children, variant: _v, size: _s, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
  Modal: ({ isOpen, children, footer }: { isOpen: boolean; children: React.ReactNode; footer: React.ReactNode }) => isOpen ? <div role='dialog'>{children}{footer}</div> : null,
}))
afterEach(() => vi.useRealTimers())
it('groups a continuous gesture, supports undo/redo, clears branches and bounds history', () => {
  const history = new ParameterHistory({ ...DEFAULT_EDITS }, 50)
  history.begin()
  for (let i = 1; i <= 20; i++) history.change({ ...DEFAULT_EDITS, contrast: i })
  history.finish()
  expect(history.undo()).toEqual(DEFAULT_EDITS)
  expect(history.canUndo).toBe(false)
  expect(history.redo()?.contrast).toBe(20)
  history.undo(); history.apply({ ...DEFAULT_EDITS, saturation: 10 })
  expect(history.canRedo).toBe(false)
  for (let i = 0; i < 75; i++) history.apply({ ...DEFAULT_EDITS, contrast: i })
  let count = 0
  while (history.undo()) count++
  expect(count).toBe(50)
})
function Adjustments() {
  const [edit, setEdit] = useState({ ...DEFAULT_EDITS })
  return <><input aria-label='文字输入' /><div contentEditable suppressContentEditableWarning>可编辑文本</div><EditorAdjustments edit={edit} onChange={setEdit} /></>
}
it('one drag is one undo; reset can be undone and shortcuts leave text editing alone', () => {
  render(<Adjustments />)
  const exposure = screen.getByLabelText('曝光')
  fireEvent.pointerDown(exposure)
  fireEvent.change(exposure, { target: { value: '0.5' } })
  fireEvent.change(exposure, { target: { value: '1' } })
  fireEvent.pointerUp(exposure)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(exposure).toHaveValue('0')
  expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(exposure).toHaveValue('1')
  fireEvent.click(screen.getByRole('button', { name: '重置全部调整' }))
  expect(exposure).toHaveValue('0')
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(exposure).toHaveValue('1')
  fireEvent.keyDown(screen.getByLabelText('文字输入'), { key: 'z', ctrlKey: true })
  expect(exposure).toHaveValue('1')
  fireEvent.keyDown(screen.getByText('可编辑文本'), { key: 'z', metaKey: true })
  expect(exposure).toHaveValue('1')
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  expect(exposure).toHaveValue('0')
})
it('protects refresh and SPA departure, supports staying or explicitly leaving', async () => {
  const router = createMemoryRouter([
    { path: '/', element: <><UnsavedChangesGuard dirty /><Link to='/next'>下一张</Link></> },
    { path: '/next', element: <p>下一张照片</p> },
  ])
  const view = render(<RouterProvider router={router} />)
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  fireEvent.click(screen.getByText('下一张'))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByText('留在当前页面'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('下一张'))
  fireEvent.click(screen.getByText('放弃未保存部分并离开'))
  expect(await screen.findByText('下一张照片')).toBeInTheDocument()
  view.unmount()
  const clean = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(clean)
  expect(clean.defaultPrevented).toBe(false)
})

