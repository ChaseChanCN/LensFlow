import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@/test-effects-mocks'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './DashboardPage'
import { listBookings, confirmBooking, type Booking } from '@/api/bookings'
import { listOrders } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/bookings', () => ({ listBookings: vi.fn(), confirmBooking: vi.fn() }))
vi.mock('@/api/orders', () => ({ listOrders: vi.fn() }))
const booking: Booking = { id: 5, client_id: 2, photographer_id: null, shoot_type: '人像', preferred_date: null, contact_info: '', note: null, location: null, duration_hours: null, status: 'pending', created_at: '2024-01-01', updated_at: '' }
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.getState().setUser({ id: 7, email: 'test@example.com', name: '摄影师', role: 'photographer', created_at: '' })
  vi.mocked(listBookings).mockResolvedValue([]); vi.mocked(listOrders).mockResolvedValue([])
})
function setup() {
  const user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/dashboard']}><Routes>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/orders" element={<h1>订单目标</h1>} />
    <Route path="/bookings/:id" element={<h1>预约详情</h1>} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return { user, client }
}
describe('DashboardPage', () => {
  it.each([
    {pending:false,active:false}, {pending:true,active:false},
    {pending:false,active:true}, {pending:true,active:true},
  ])('enables only nonzero statistic cards: pending=$pending active=$active', async ({pending,active}) => {
    vi.mocked(listBookings).mockResolvedValue(pending?[booking]:[])
    vi.mocked(listOrders).mockResolvedValue(active?[{id:1,booking_id:5,client_id:2,photographer_id:7,status:'WAITING_SHOOT',created_at:'',updated_at:'',archived_at:null}]:[])
    setup()
    const pendingCard=await screen.findByRole('button',{name:`待确认预约 ${pending?1:0}`})
    const activeCard=await screen.findByRole('button',{name:`进行中订单 ${active?1:0}`})
    expect(!!pendingCard.closest('.effects-surface-beam')).toBe(pending)
    expect(!!activeCard.closest('.effects-surface-beam')).toBe(active)
    expect(screen.getByRole('button',{name:/总订单数/}).closest('.effects-surface-beam')).toBeNull()
  })
  it('does not highlight confirmed bookings or archived/cancelled orders', async () => {
    vi.mocked(listBookings).mockResolvedValue([{...booking,status:'confirmed'}])
    vi.mocked(listOrders).mockResolvedValue((['ARCHIVED','CANCELLED'] as const).map((status,id)=>({id,booking_id:5,client_id:2,photographer_id:7,status,created_at:'',updated_at:'',archived_at:null})))
    setup()
    const card=await screen.findByRole('button',{name:'进行中订单 0'})
    expect(card.closest('.effects-surface-beam')).toBeNull()
    expect(screen.getByRole('button',{name:'待确认预约 0'}).closest('.effects-surface-beam')).toBeNull()
  })
  it('uses shared empty state only after loading', async () => {
    let resolve!: (value: Booking[]) => void
    vi.mocked(listBookings).mockImplementation(() => new Promise((done) => { resolve = done }))
    setup()
    expect(screen.getByRole('status')).toHaveAccessibleName('正在加载预约')
    expect(screen.getByRole('button',{name:'待确认预约 —'}).closest('.effects-surface-beam')).toBeNull()
    expect(screen.queryByText('暂无待确认预约')).not.toBeInTheDocument()
    resolve([])
    expect(await screen.findByRole('region', { name: '暂无待确认预约' })).toBeInTheDocument()
  })
  it('shows failures instead of reporting zero/empty', async () => {
    vi.mocked(listBookings).mockRejectedValue(new Error('offline')); vi.mocked(listOrders).mockRejectedValue(new Error('offline'))
    setup()
    expect(await screen.findByRole('heading', { name: '预约加载失败' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '订单概览加载失败' })).toBeInTheDocument()
    expect(document.querySelector('.material-stat-grid .effects-surface-beam')).toBeNull()
    expect(screen.queryByText('暂无待确认预约')).not.toBeInTheDocument()
  })
  it('opens booking details without nested buttons', async () => {
    vi.mocked(listBookings).mockResolvedValue([booking]); const { user } = setup()
    const link = await screen.findByRole('link', { name: '#5 · 人像' })
    expect(document.querySelector('button button')).toBeNull()
    await user.click(link)
    expect(screen.getByRole('heading', { name: '预约详情' })).toBeInTheDocument()
  })
  it.each(['进行中订单', '总订单数', '查看全部订单 →'])('opens orders with %s', async (label) => {
    const { user } = setup(); await screen.findByText('暂无待确认预约')
    await user.click(label === '查看全部订单 →' ? screen.getByRole('link', { name: label }) : screen.getByRole('button', { name: new RegExp(label) }))
    expect(screen.getByRole('heading', { name: '订单目标' })).toBeInTheDocument()
  })
  it('confirms once, shows loading and invalidates both queries', async () => {
    vi.mocked(listBookings).mockResolvedValue([booking])
    let resolve!: (value: Booking) => void
    vi.mocked(confirmBooking).mockImplementation(() => new Promise((done) => { resolve = done }))
    const { user, client } = setup(); const invalidate = vi.spyOn(client, 'invalidateQueries')
    const confirm = await screen.findByRole('button', { name: '确认预约 #5' }); await user.click(confirm)
    expect(confirm).toBeDisabled(); expect(confirm).toHaveAttribute('aria-busy', 'true')
    await user.click(confirm); expect(confirmBooking).toHaveBeenCalledExactlyOnceWith(5, 7)
    vi.mocked(listBookings).mockResolvedValue([{ ...booking, status: 'confirmed' }]); resolve({ ...booking, status: 'confirmed' })
    expect(await screen.findByText('暂无待确认预约')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'待确认预约 0'}).closest('.effects-surface-beam')).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bookings'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] })
    expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument()
  })
  it('announces confirmation errors and permits retry', async () => {
    vi.mocked(listBookings).mockResolvedValue([booking]); vi.mocked(confirmBooking).mockRejectedValue(new Error('确认失败'))
    const { user } = setup(); await user.click(await screen.findByRole('button', { name: '确认预约 #5' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('确认失败')
    await waitFor(() => expect(screen.getByRole('button', { name: '确认预约 #5' })).toBeEnabled())
  })
  it('respects reduced motion when scrolling to bookings', async () => {
    const scroll = vi.fn(); vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const original = HTMLElement.prototype.scrollIntoView; HTMLElement.prototype.scrollIntoView = scroll
    try {
      const { user } = setup(); await screen.findByText('暂无待确认预约')
      await user.click(screen.getByRole('button', { name: /待确认预约 0/ }))
      expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
    } finally { HTMLElement.prototype.scrollIntoView = original; vi.unstubAllGlobals() }
  })
})
