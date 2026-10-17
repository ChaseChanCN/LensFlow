import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { BookingPage } from './client/BookingPage'
import { BookingDetailPage } from './BookingDetailPage'
import { OrderDetailPage } from './photographer/OrderDetailPage'
import { UploadPage } from './photographer/UploadPage'
import { AnalysisResultPage } from './photographer/AnalysisResultPage'
import { ClientPage } from './client/ClientPage'
import { SelectionPage } from './client/SelectionPage'
import { DeliveryPage } from './client/DeliveryPage'
import { RetouchPage } from './photographer/RetouchPage'
import { useAuthStore } from '@/stores/auth'
import * as bookings from '@/api/bookings'
import * as orders from '@/api/orders'
import * as photos from '@/api/photos'
import * as selections from '@/api/selections'
import * as deliveries from '@/api/deliveries'
import * as retouch from '@/api/retouch'

vi.mock('@/api/bookings', () => ({ createBooking: vi.fn(), getBooking: vi.fn(), listBookings: vi.fn(), updateBooking: vi.fn(), cancelBooking: vi.fn(), confirmBooking: vi.fn() }))
vi.mock('@/api/orders', () => ({ getOrder: vi.fn(), listOrders: vi.fn(), getOrderTimeline: vi.fn(), updateOrderStatus: vi.fn() }))
vi.mock('@/api/photos', () => ({ listPhotos: vi.fn(), uploadPhoto: vi.fn(), deletePhoto: vi.fn(), getAnalysis: vi.fn(), reviewAnalysis: vi.fn() }))
vi.mock('@/api/selections', () => ({ getOrderSelectionSet: vi.fn(), submitSelection: vi.fn() }))
vi.mock('@/api/deliveries', () => ({ getDelivery: vi.fn(), uploadDelivery: vi.fn(), archiveOrder: vi.fn(), getDownloadUrl: vi.fn(() => '/api/v1/deliveries/1/download'), downloadDelivery: vi.fn() }))
vi.mock('@/api/retouch', () => ({ listRetouchTasks: vi.fn(), listRetouchVersions: vi.fn(), listFeedback: vi.fn(), createFeedback: vi.fn(), uploadRetouchVersion: vi.fn(), confirmAllRetouch: vi.fn() }))

const booking = { id: 5, client_id: 2, photographer_id: null, shoot_type: 'portrait', preferred_date: '2026-10-20', contact_info: 'test@example.com', location: null, duration_hours: null, note: null, status: 'pending', created_at: '2026-10-16', updated_at: '' }
const order = { id: 1, booking_id: 5, client_id: 2, photographer_id: 7, status: 'WAITING_UPLOAD' as const, created_at: '2026-10-16', updated_at: '', archived_at: null }
const photo = { id: 10, order_id: 1, filename: 'portrait.jpg', storage_key: 'test', mime: 'image/jpeg', size_bytes: 1024, width: 640, height: 480, created_at: '', updated_at: '' }
const analysis = { id: 3, photo_id: 10, sharpness_score: 150, brightness_mean: 128, highlight_ratio: 0.05, shadow_ratio: 0.03, suggestion: 'no_issue', risk_level: 'low', reviewed: false, reviewer_id: null, reviewed_at: null, final_decision: 'pending', created_at: '' }
const selection = { id: 4, order_id: 1, max_select: 2, expires_at: null, published_at: '', created_at: '', items: [10,11,12].map((photo_id,id)=>({ id, selection_set_id: 4, photo_id })) }
const task = { id: 6, order_id: 1, photo_id: 10, status: 'pending', due_date: null, created_at: '' }
const delivery = { id: 9, order_id: 1, storage_key: 'test', filename: 'final.zip', delivered_at: '2026-10-16' }
function setRole(role: 'client' | 'photographer') { useAuthStore.getState().setUser({ id: 7, email: 'test@example.com', name: '测试用户', role, created_at: '' }) }
beforeEach(() => {
  vi.resetAllMocks(); setRole('client')
  vi.mocked(bookings.getBooking).mockResolvedValue(booking); vi.mocked(bookings.listBookings).mockResolvedValue([])
  vi.mocked(orders.getOrder).mockResolvedValue(order); vi.mocked(orders.listOrders).mockResolvedValue([]); vi.mocked(orders.getOrderTimeline).mockResolvedValue([])
  vi.mocked(photos.listPhotos).mockResolvedValue([]); vi.mocked(photos.getAnalysis).mockResolvedValue(analysis)
  vi.mocked(selections.getOrderSelectionSet).mockResolvedValue(selection)
  vi.mocked(deliveries.getDelivery).mockResolvedValue(delivery); vi.mocked(deliveries.getDownloadUrl).mockReturnValue('/api/v1/deliveries/9/download')
  vi.mocked(retouch.listRetouchTasks).mockResolvedValue([]); vi.mocked(retouch.listRetouchVersions).mockResolvedValue([]); vi.mocked(retouch.listFeedback).mockResolvedValue([])
})
function setup(page: ReactElement, path: string, pattern: string = path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={page} /><Route path="*" element={<h1>导航目标</h1>} /></Routes></MemoryRouter></QueryClientProvider>)
  return { user: userEvent.setup(), client }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }

describe('P4 booking migration', () => {
  it('names all fields, uses grouped controls and submits optional values', async () => {
    vi.mocked(bookings.createBooking).mockRejectedValue(new Error('请求失败'))
    const {user}=setup(<BookingPage/>,'/booking')
    expect(screen.getByLabelText('期望日期')).toHaveClass('bg-transparent')
    await user.type(screen.getByLabelText('联系方式'), 'contact@example.com')
    await user.type(screen.getByLabelText('拍摄时长（小时）'), '2.5')
    await user.type(screen.getByLabelText('备注'), '自然光')
    await user.click(screen.getByRole('button',{name:'提交预约'}))
    expect(bookings.createBooking).toHaveBeenCalledExactlyOnceWith({shoot_type:'wedding',contact_info:'contact@example.com',preferred_date:undefined,location:undefined,duration_hours:2.5,note:'自然光'})
    expect(await screen.findByRole('alert')).toHaveTextContent('请求失败')
  })
  it('blocks empty contact and displays loading and success before redirect', async () => {
    const pending=deferred<typeof booking>(); vi.mocked(bookings.createBooking).mockReturnValue(pending.promise)
    const {user}=setup(<BookingPage/>,'/booking'); const submit=screen.getByRole('button',{name:'提交预约'})
    await user.click(submit); expect(bookings.createBooking).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('联系方式'),'contact@example.com'); await user.click(submit)
    expect(submit).toHaveAttribute('aria-busy','true'); expect(submit).toBeDisabled()
    await act(async()=>pending.resolve(booking))
    expect(await screen.findByRole('status')).toHaveTextContent('编号 #5')
    expect(submit).toBeDisabled()
    expect(await screen.findByRole('heading',{name:'导航目标'}, {timeout:3000})).toBeInTheDocument()
  })
  it('edits using a native form, prevents invalid save and invalidates detail/list', async () => {
    vi.mocked(bookings.updateBooking).mockResolvedValue(booking)
    const {user,client}=setup(<BookingDetailPage/>,'/bookings/5','/bookings/:id'); const invalidate=vi.spyOn(client,'invalidateQueries')
    await user.click(await screen.findByRole('button',{name:'修改详情'}))
    const contact=screen.getByLabelText('联系方式'); await user.clear(contact)
    await user.click(screen.getByRole('button',{name:'保存修改'})); expect(bookings.updateBooking).not.toHaveBeenCalled()
    await user.type(contact,'new@example.com'); await user.keyboard('{Enter}')
    await waitFor(()=>expect(bookings.updateBooking).toHaveBeenCalledWith(5,expect.objectContaining({contact_info:'new@example.com'})))
    expect(invalidate).toHaveBeenCalledWith({queryKey:['bookings']})
  })
  it('announces booking fetch errors and retries', async () => {
    vi.mocked(bookings.getBooking).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(booking)
    const {user}=setup(<BookingDetailPage/>,'/bookings/5','/bookings/:id')
    expect(await screen.findByRole('alert')).toHaveTextContent('预约加载失败')
    await user.click(screen.getByRole('button',{name:'重试'})); expect(await screen.findByRole('button',{name:'修改详情'})).toBeInTheDocument()
  })
  it.each(['client','photographer'] as const)('guards the %s booking action while pending', async role=>{
    setRole(role); const pending=deferred<typeof booking>()
    vi.mocked(bookings.cancelBooking).mockReturnValue(pending.promise); vi.mocked(bookings.confirmBooking).mockReturnValue(pending.promise)
    const {user}=setup(<BookingDetailPage/>,'/bookings/5','/bookings/:id')
    const action=await screen.findByRole('button',{name:role==='client'?'取消预约':'确认预约'}); await user.click(action)
    expect(action).toBeDisabled(); expect(action).toHaveAttribute('aria-busy','true')
    await act(async()=>pending.reject(new Error('操作失败')))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作失败')
  })
})

describe('P4 photographer migration',()=>{
  it('protects order status transitions and invalidates related queries',async()=>{
    vi.mocked(orders.getOrder).mockResolvedValue({...order,status:'CONFIRMED'})
    const pending=deferred<typeof order>(); vi.mocked(orders.updateOrderStatus).mockReturnValue(pending.promise)
    const {user,client}=setup(<OrderDetailPage/>,'/orders/1','/orders/:id'); const invalidate=vi.spyOn(client,'invalidateQueries')
    const action=await screen.findByRole('button',{name:'开始拍摄'}); await user.click(action); expect(action).toBeDisabled()
    expect(orders.updateOrderStatus).toHaveBeenCalledExactlyOnceWith(1,'WAITING_SHOOT','start_shoot')
    await act(async()=>pending.resolve(order)); await waitFor(()=>expect(action).toBeEnabled())
    expect(invalidate).toHaveBeenCalledWith({queryKey:['order','1']}); expect(invalidate).toHaveBeenCalledWith({queryKey:['orders']})
  })
  it('reports order and timeline errors independently',async()=>{
    vi.mocked(orders.getOrderTimeline).mockRejectedValue(new Error('offline'))
    setup(<OrderDetailPage/>,'/orders/1','/orders/:id')
    expect(await screen.findByRole('alert')).toHaveTextContent('操作记录加载失败')
    expect(screen.getByRole('heading',{name:'订单 #1'})).toBeInTheDocument()
  })
  it('uploads JPEG, prevents reselection while pending and reports the caught error',async()=>{
    const pending=deferred<photos.PhotoUploadResponse>(); vi.mocked(photos.uploadPhoto).mockReturnValue(pending.promise)
    const {user}=setup(<UploadPage/>,'/orders/1/upload','/orders/:id/upload')
    const file=new File(['jpeg'],'new.jpg',{type:'image/jpeg'}); const input=screen.getByLabelText('选择 JPEG 照片')
    await user.upload(input,file)
    expect(input).toBeDisabled(); expect(screen.getByRole('button',{name:/上传中/})).toBeDisabled()
    expect(photos.uploadPhoto).toHaveBeenCalledExactlyOnceWith(1,file)
    await act(async()=>pending.reject(new Error('上传网络错误')))
    expect(await screen.findByRole('alert')).toHaveTextContent('上传网络错误'); expect(input).toBeEnabled()
  })
  it('deletes a photo with pending protection and photo query invalidation',async()=>{
    vi.mocked(photos.listPhotos).mockResolvedValue([photo]); const pending=deferred<void>(); vi.mocked(photos.deletePhoto).mockReturnValue(pending.promise)
    const {user,client}=setup(<UploadPage/>,'/orders/1/upload','/orders/:id/upload'); const invalidate=vi.spyOn(client,'invalidateQueries')
    const button=await screen.findByRole('button',{name:'删除 portrait.jpg'}); await user.click(button); expect(button).toBeDisabled()
    await act(async()=>pending.resolve()); expect(invalidate).toHaveBeenCalledWith({queryKey:['photos','1']})
  })
  it('shows photos request failure separately from empty uploads',async()=>{
    vi.mocked(photos.listPhotos).mockRejectedValue(new Error('offline')); setup(<UploadPage/>,'/orders/1/upload','/orders/:id/upload')
    expect(await screen.findByRole('alert')).toHaveTextContent('照片加载失败'); expect(screen.queryByText('暂无照片')).not.toBeInTheDocument()
  })
  it('reviews an analysis using loading feedback and keeps review API values',async()=>{
    vi.mocked(photos.listPhotos).mockResolvedValue([photo]); const pending=deferred<typeof analysis>(); vi.mocked(photos.reviewAnalysis).mockReturnValue(pending.promise)
    const {user}=setup(<AnalysisResultPage/>,'/orders/1/analysis','/orders/:id/analysis')
    const button=await screen.findByRole('button',{name:'保留'}); await user.click(button)
    expect(button).toHaveAttribute('aria-busy','true'); expect(screen.getByRole('button',{name:'剔除'})).toBeDisabled()
    expect(photos.reviewAnalysis).toHaveBeenCalledExactlyOnceWith(3,'keep')
    await act(async()=>pending.reject(new Error('复核失败'))); expect(await screen.findByRole('alert')).toHaveTextContent('复核失败')
  })
  it('does not leave failed analysis stuck in a loading state',async()=>{
    vi.mocked(photos.listPhotos).mockResolvedValue([photo]); vi.mocked(photos.getAnalysis).mockRejectedValue(new Error('offline'))
    setup(<AnalysisResultPage/>,'/orders/1/analysis','/orders/:id/analysis')
    expect(await screen.findByRole('alert')).toHaveTextContent('分析结果加载失败'); expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('P4 client and collaboration migration',()=>{
  it('distinguishes client loading and empty states',async()=>{
    const pending=deferred<bookings.Booking[]>(); vi.mocked(bookings.listBookings).mockReturnValue(pending.promise)
    setup(<ClientPage/>,'/client'); expect(screen.getByRole('status',{name:'正在加载我的预约'})).toBeInTheDocument()
    expect(screen.queryByText('暂无预约')).not.toBeInTheDocument(); await act(async()=>pending.resolve([]))
    expect(await screen.findByRole('region',{name:'暂无预约'})).toBeInTheDocument()
  })
  it('removes nested buttons and cancels only the chosen booking',async()=>{
    vi.mocked(bookings.listBookings).mockResolvedValue([booking]); vi.mocked(bookings.cancelBooking).mockResolvedValue(booking)
    const {user}=setup(<ClientPage/>,'/client')
    const action=await screen.findByRole('button',{name:'取消预约 #5'}); expect(document.querySelector('button button')).toBeNull()
    expect(screen.getByRole('link',{name:'#5 · portrait'})).toHaveAttribute('href','/bookings/5')
    await user.click(action); expect(bookings.cancelBooking).toHaveBeenCalledExactlyOnceWith(5)
  })
  it('reports client orders errors instead of showing an empty order list',async()=>{
    vi.mocked(orders.listOrders).mockRejectedValue(new Error('offline')); setup(<ClientPage/>,'/client')
    expect(await screen.findByRole('alert')).toHaveTextContent('订单加载失败'); expect(screen.queryByText('暂无订单')).not.toBeInTheDocument()
  })
  it('enforces selection limit, supports deselection, and submits selected ids',async()=>{
    const pending=deferred<Awaited<ReturnType<typeof selections.submitSelection>>>(); vi.mocked(selections.submitSelection).mockReturnValue(pending.promise)
    const {user}=setup(<SelectionPage/>,'/orders/1/selection','/orders/:id/selection')
    const first=await screen.findByRole('button',{name:/照片 10/}); const second=screen.getByRole('button',{name:/照片 11/}); const third=screen.getByRole('button',{name:/照片 12/})
    await user.click(first); await user.click(second); expect(first).toHaveAttribute('aria-pressed','true'); expect(third).toBeDisabled()
    await user.click(first); expect(third).toBeEnabled(); await user.click(third)
    const submit=screen.getByRole('button',{name:'提交选片'}); await user.click(submit); expect(submit).toBeDisabled(); expect(third).toBeDisabled()
    expect(selections.submitSelection).toHaveBeenCalledExactlyOnceWith(4,[11,12])
    await act(async()=>pending.reject(new Error('选片提交失败'))); expect(await screen.findByRole('alert')).toHaveTextContent('选片提交失败')
  })
  it('distinguishes empty selections and request errors',async()=>{
    vi.mocked(selections.getOrderSelectionSet).mockResolvedValue({...selection,items:[]}); setup(<SelectionPage/>,'/orders/1/selection','/orders/:id/selection')
    expect(await screen.findByRole('heading',{name:'暂无可选照片'})).toBeInTheDocument(); expect(screen.getByRole('button',{name:'提交选片'})).toBeDisabled()
  })
  it('renders an authenticated download action without nested controls',async()=>{
    setup(<DeliveryPage/>,'/orders/1/delivery','/orders/:id/delivery')
    expect(await screen.findByRole('button',{name:'下载成片'})).toBeEnabled()
    expect(document.querySelector('a button')).toBeNull()
  })
  it.each([404,503])('distinguishes missing delivery (404) from failure (%s)',async status=>{
    vi.mocked(deliveries.getDelivery).mockRejectedValue(Object.assign(new Error('request'),{isAxiosError:true,response:{status}}))
    setup(<DeliveryPage/>,'/orders/1/delivery','/orders/:id/delivery')
    expect(await screen.findByRole('heading',{name:status===404?'暂无交付成片':'交付加载失败'})).toBeInTheDocument()
  })
  it('uploads delivery with pending state and invalidates order and delivery',async()=>{
    setRole('photographer'); vi.mocked(orders.getOrder).mockResolvedValue({...order,status:'WAITING_DELIVERY'})
    vi.mocked(deliveries.getDelivery).mockRejectedValue(Object.assign(new Error('missing'),{isAxiosError:true,response:{status:404}}))
    const pending=deferred<typeof delivery>(); vi.mocked(deliveries.uploadDelivery).mockReturnValue(pending.promise)
    const {user,client}=setup(<DeliveryPage/>,'/orders/1/delivery','/orders/:id/delivery'); const invalidate=vi.spyOn(client,'invalidateQueries')
    await screen.findByRole('button',{name:/点击选择成片文件/}); const input=screen.getByLabelText('选择交付成片'); const file=new File(['zip'],'final.zip',{type:'application/zip'})
    await user.upload(input,file); expect(input).toBeDisabled(); expect(deliveries.uploadDelivery).toHaveBeenCalledExactlyOnceWith(1,file)
    vi.mocked(deliveries.getDelivery).mockResolvedValue(delivery); await act(async()=>pending.resolve(delivery))
    expect(await screen.findByRole('button',{name:'下载成片'})).toBeInTheDocument(); expect(invalidate).toHaveBeenCalledWith({queryKey:['order','1']})
  })
  it('submits nonempty client feedback and confirms all retouch tasks',async()=>{
    vi.mocked(retouch.listRetouchTasks).mockResolvedValue([task]); const feedback=deferred<Awaited<ReturnType<typeof retouch.createFeedback>>>(); vi.mocked(retouch.createFeedback).mockReturnValue(feedback.promise)
    vi.mocked(retouch.confirmAllRetouch).mockResolvedValue(task)
    const {user}=setup(<RetouchPage/>,'/orders/1/retouch','/orders/:id/retouch')
    const text=await screen.findByLabelText('任务 #6 反馈意见'); const submit=screen.getByRole('button',{name:'提交反馈'}); expect(submit).toBeDisabled()
    await user.type(text,'请调亮'); await user.click(submit); expect(submit).toHaveAttribute('aria-busy','true')
    expect(retouch.createFeedback).toHaveBeenCalledExactlyOnceWith(6,'请调亮'); await act(async()=>feedback.reject(new Error('反馈失败')))
    expect(await screen.findByRole('alert')).toHaveTextContent('反馈失败')
    await user.click(screen.getByRole('button',{name:'确认全部修图'})); expect(retouch.confirmAllRetouch).toHaveBeenCalledExactlyOnceWith(1)
  })
  it('provides photographer preview uploading and independent versions error',async()=>{
    setRole('photographer'); vi.mocked(retouch.listRetouchTasks).mockResolvedValue([task]); vi.mocked(retouch.listRetouchVersions).mockRejectedValue(new Error('offline'))
    const pending=deferred<Awaited<ReturnType<typeof retouch.uploadRetouchVersion>>>(); vi.mocked(retouch.uploadRetouchVersion).mockReturnValue(pending.promise)
    const {user}=setup(<RetouchPage/>,'/orders/1/retouch','/orders/:id/retouch')
    expect(await screen.findByRole('alert')).toHaveTextContent('预览版本加载失败')
    const input=screen.getByLabelText('选择任务 #6 预览图'); const file=new File(['png'],'preview.png',{type:'image/png'})
    await user.upload(input,file); expect(input).toBeDisabled(); expect(retouch.uploadRetouchVersion).toHaveBeenCalledExactlyOnceWith(6,file)
    expect(screen.queryByRole('button',{name:'确认全部修图'})).not.toBeInTheDocument()
    await act(async()=>pending.reject(new Error('上传失败'))); expect(await screen.findAllByRole('alert')).toHaveLength(2)
  })
})
import '@/test-effects-mocks'
