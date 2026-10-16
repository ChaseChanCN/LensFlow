import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrdersPage } from './OrdersPage'
import { listOrders } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/orders', () => ({ listOrders: vi.fn() }))
const order = { id: 1, booking_id: 1, client_id: 2, photographer_id: 1, status: 'CONFIRMED' as const, created_at: '2024-01-01T00:00:00', updated_at: '', archived_at: null }
beforeEach(() => { vi.resetAllMocks(); useAuthStore.getState().logout() })
function History() {
  const navigate = useNavigate()
  return <><button onClick={() => navigate(-1)}>后退</button><button onClick={() => navigate(1)}>前进</button></>
}
function setup() {
  const user = userEvent.setup()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <MemoryRouter initialEntries={['/orders']}><History /><Routes>
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:id" element={<h1>订单详情</h1>} />
      <Route path="/dashboard" element={<h1>工作台目标</h1>} />
      <Route path="/login" element={<h1>登录目标</h1>} />
    </Routes></MemoryRouter>
  </QueryClientProvider>)
  return user
}
describe('OrdersPage', () => {
  it('renders title and Spinner while loading without an empty state', () => {
    vi.mocked(listOrders).mockReturnValue(new Promise(() => {})); setup()
    expect(screen.getByRole('heading', { name: '订单' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAccessibleName('正在加载订单')
    expect(screen.queryByRole('heading', { name: '暂无订单' })).not.toBeInTheDocument()
  })
  it('renders the shared empty state', async () => {
    vi.mocked(listOrders).mockResolvedValue([]); setup()
    expect(await screen.findByRole('region', { name: '暂无订单' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('loads orders and navigates by keyboard with back and forward history', async () => {
    vi.mocked(listOrders).mockResolvedValue([order]); const user = setup()
    const row = await screen.findByRole('button', { name: /订单 #1/ })
    expect(within(row).getAllByText('已确认')).toHaveLength(2)
    row.focus(); await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: '订单详情' })).toBeInTheDocument()
    await user.click(screen.getByText('后退'))
    expect(await screen.findByRole('button', { name: /订单 #1/ })).toBeInTheDocument()
    await user.click(screen.getByText('前进'))
    expect(screen.getByRole('heading', { name: '订单详情' })).toBeInTheDocument()
  })
  it('shows an actionable load error and retries', async () => {
    vi.mocked(listOrders).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    const user = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('订单加载失败')
    expect(screen.queryByRole('heading', { name: '暂无订单' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '暂无订单' })).toBeInTheDocument()
  })
  it('uses the dashboard route and logs out', async () => {
    vi.mocked(listOrders).mockResolvedValue([]); const user = setup()
    expect(screen.getByRole('link', { name: '工作台' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: '订单' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(screen.getByRole('heading', { name: '登录目标' })).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
  it('retains status badges and labels', async () => {
    vi.mocked(listOrders).mockResolvedValue([{ ...order, status: 'CANCELLED' }, { ...order, id: 2, status: 'ARCHIVED' }]); setup()
    expect(await screen.findAllByText('已取消')).toHaveLength(2)
    expect(screen.getByText('已归档')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toHaveClass('text-success-label')
  })
})
