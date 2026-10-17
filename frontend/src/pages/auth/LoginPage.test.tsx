import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@/test-effects-mocks'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/auth', () => ({ login: vi.fn(), extractErrorMessage: (e: unknown) => e instanceof Error ? e.message : 'error' }))
beforeEach(() => { vi.resetAllMocks(); useAuthStore.getState().logout() })
function setup() {
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={['/login']}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/dashboard" element={<h1>摄影师工作台</h1>} />
    <Route path="/client" element={<h1>客户首页</h1>} />
    <Route path="/register" element={<h1>注册账号</h1>} />
  </Routes></MemoryRouter>)
  return user
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('邮箱'), 'test@example.com')
  await user.type(screen.getByLabelText('密码'), 'password123')
}
describe('LoginPage', () => {
  it('uses one monochrome Beam layer and no Metal layer for login', async () => {
    setup()
    expect(await screen.findByTestId('beam-renderer')).toHaveAttribute('data-color','mono')
    expect(screen.queryByTestId('metal-renderer')).not.toBeInTheDocument()
    const button=screen.getByRole('button',{name:'登录'})
    expect(button.closest('.effects-surface')).toHaveClass('effects-surface-beam')
    expect(button.closest('.effects-surface')?.querySelectorAll('.effects-surface-overlay')).toHaveLength(1)
  })
  it('renders named grouped inputs with autocomplete and native validation', () => {
    setup()
    expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('密码')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('邮箱')).toBeRequired()
    expect(screen.getByLabelText('密码')).toBeRequired()
    expect(screen.getByLabelText('邮箱')).toHaveClass('bg-transparent', 'border-0')
  })
  it('supports Tab order and the register link', async () => {
    const user = setup()
    await user.tab(); expect(screen.getByRole('button', { name: '切换浅色模式' })).toHaveFocus()
    await user.tab(); expect(screen.getByLabelText('邮箱')).toHaveFocus()
    await user.tab(); expect(screen.getByLabelText('密码')).toHaveFocus()
    await user.tab(); expect(screen.getByRole('button', { name: '登录' })).toHaveFocus()
    await user.tab(); expect(screen.getByRole('link', { name: '注册' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: '注册账号' })).toBeInTheDocument()
  })
  it('blocks invalid native form submission', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(login).not.toHaveBeenCalled()
    expect(screen.getByLabelText('邮箱')).toBeInvalid()
  })
  it.each(['photographer', 'client', 'admin'] as const)('submits with Enter and routes %s after storing auth', async (role) => {
    vi.mocked(login).mockResolvedValue({ access_token: 'test-token', token_type: 'bearer', user: { id: 1, email: 'test@example.com', name: '测试', role, created_at: '' } })
    const user = setup(); await fill(user); await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: role === 'client' ? '客户首页' : '摄影师工作台' })).toBeInTheDocument()
    expect(login).toHaveBeenCalledExactlyOnceWith({ email: 'test@example.com', password: 'password123' })
    expect(useAuthStore.getState().token).toBe('test-token')
    expect(useAuthStore.getState().user?.role).toBe(role)
  })
  it('keeps button name, blocks duplicate submission and announces failure before retry', async () => {
    let reject!: (reason: Error) => void
    vi.mocked(login).mockImplementationOnce(() => new Promise((_, done) => { reject = done }))
    const user = setup(); await fill(user)
    const button = screen.getByRole('button', { name: '登录' }); await user.click(button)
    expect(button).toBeDisabled(); expect(button).toHaveAttribute('aria-busy', 'true')
    await user.click(button); expect(login).toHaveBeenCalledTimes(1)
    reject(new Error('账号或密码错误'))
    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误')
    expect(screen.getByLabelText('密码')).toHaveAccessibleDescription('账号或密码错误')
    await waitFor(() => expect(button).toBeEnabled())
    vi.mocked(login).mockRejectedValueOnce(new Error('请稍后重试')); await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('请稍后重试')
    expect(login).toHaveBeenCalledTimes(2)
  })
})
