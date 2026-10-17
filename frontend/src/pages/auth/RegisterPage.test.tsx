import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RegisterPage } from './RegisterPage'
import { register } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/auth', () => ({ register: vi.fn(), extractErrorMessage: (e: unknown) => e instanceof Error ? e.message : 'error' }))
beforeEach(() => { vi.resetAllMocks(); useAuthStore.getState().logout() })
function setup() {
  render(<MemoryRouter initialEntries={['/register']}><Routes>
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/client" element={<h1>客户首页</h1>} />
    <Route path="/dashboard" element={<h1>摄影师工作台</h1>} />
  </Routes></MemoryRouter>)
  return userEvent.setup()
}
describe('RegisterPage regression', () => {
  it('provides grouped, named fields, autocomplete and keyboard order', async () => {
    const user=setup()
    expect(screen.getByLabelText('姓名')).toHaveClass('bg-transparent')
    expect(screen.getByLabelText('密码')).toHaveAttribute('autocomplete','new-password')
    expect(screen.getByLabelText('账号类型')).toHaveClass('border-0')
    await user.tab(); expect(screen.getByRole('link',{name:/LensFlow/})).toHaveFocus()
    await user.tab(); expect(screen.getByRole('button',{name:/切换.*模式/})).toHaveFocus()
    await user.tab(); expect(screen.getByRole('link',{name:'前往登录'})).toHaveFocus()
    await user.tab(); expect(screen.getByRole('link',{name:'前往注册'})).toHaveFocus()
    await user.tab(); expect(screen.getByLabelText('姓名')).toHaveFocus()
    await user.click(screen.getByRole('button',{name:'注册'})); expect(register).not.toHaveBeenCalled()
  })
  it('keeps the register name and guards pending submission', async () => {
    let reject!: (error: Error)=>void
    vi.mocked(register).mockReturnValue(new Promise((_,done)=>{reject=done}))
    const user=setup()
    await user.type(screen.getByLabelText('姓名'),'新用户'); await user.type(screen.getByLabelText('邮箱'),'new@example.com'); await user.type(screen.getByLabelText('密码'),'password123')
    const button=screen.getByRole('button',{name:'注册'}); await user.click(button)
    expect(button).toBeDisabled(); expect(button).toHaveAttribute('aria-busy','true')
    await user.click(button); expect(register).toHaveBeenCalledTimes(1)
    reject(new Error('注册失败'))
    expect(await screen.findByRole('alert')).toHaveTextContent('注册失败')
    expect(screen.getByLabelText('邮箱')).toHaveAccessibleDescription('注册失败')
  })
  it.each(['client', 'photographer'] as const)('preserves %s registration and routes to the correct home', async (role) => {
    vi.mocked(register).mockResolvedValue({ access_token: 'registration-test', token_type: 'bearer', user: { id: 8, email: 'new@example.com', name: '新用户', role, created_at: '' } })
    const user = setup()
    await user.type(screen.getByPlaceholderText('姓名'), '新用户')
    await user.type(screen.getByPlaceholderText('邮箱'), 'new@example.com')
    await user.type(screen.getByPlaceholderText('密码'), 'password123')
    await user.selectOptions(screen.getByRole('combobox'), role)
    await user.click(screen.getByRole('button', { name: '注册' }))
    expect(await screen.findByRole('heading', { name: role === 'client' ? '客户首页' : '摄影师工作台' })).toBeInTheDocument()
    expect(register).toHaveBeenCalledExactlyOnceWith({ email: 'new@example.com', password: 'password123', name: '新用户', role })
    expect(useAuthStore.getState().token).toBe('registration-test')
  })
  it('keeps the login link and displays a rejected registration', async () => {
    vi.mocked(register).mockRejectedValue(new Error('邮箱已注册'))
    const user = setup()
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login')
    await user.type(screen.getByPlaceholderText('姓名'), '新用户')
    await user.type(screen.getByPlaceholderText('邮箱'), 'new@example.com')
    await user.type(screen.getByPlaceholderText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '注册' }))
    expect(await screen.findByText('邮箱已注册')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '注册' })).toBeEnabled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
