import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { PhotoEditorPage } from './PhotoEditorPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { listPhotos } from '@/api/photos'
import { useAuthStore } from '@/stores/auth'
vi.mock('@/api/photos', () => ({ listPhotos: vi.fn() }))
vi.mock('@/components/photo-editor/PhotoWorkbench', () => ({ PhotoWorkbench: () => <div>真实照片工作台</div> }))
vi.mock('@/components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
const user = { id: 1, email: 'p@test.com', name: 'P', role: 'photographer' as const, phone: undefined, created_at: '' }
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/orders/1/photos/2/edit']}><Routes>
      <Route path='/orders/:id/photos/:photoId/edit' element={<ProtectedRoute><PhotoEditorPage /></ProtectedRoute>} />
      <Route path='/login' element={<div>请先登录</div>} />
    </Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ user, token: 'test', isAuthenticated: true }) })
it('does not request protected photos when unauthenticated', () => {
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
  show()
  expect(screen.getByText('请先登录')).toBeInTheDocument()
  expect(listPhotos).not.toHaveBeenCalled()
})
it('does not request photos for customer roles', () => {
  useAuthStore.setState({ user: { ...user, role: 'client' } })
  show()
  expect(screen.getByText('仅订单摄影师可使用修图工作台')).toBeInTheDocument()
  expect(listPhotos).not.toHaveBeenCalled()
})
it('loads existing order photos and mounts the selected workbench', async () => {
  vi.mocked(listPhotos).mockResolvedValue([{ id: 2, order_id: 1, filename: 'real.jpg' }] as Awaited<ReturnType<typeof listPhotos>>)
  show()
  expect(await screen.findByText('真实照片工作台')).toBeInTheDocument()
  expect(screen.getByRole('combobox')).toHaveValue('2')
})
it('rejects photo IDs outside the displayed order', async () => {
  vi.mocked(listPhotos).mockResolvedValue([{ id: 2, order_id: 99, filename: 'other.jpg' }] as Awaited<ReturnType<typeof listPhotos>>)
  show()
  await waitFor(() => expect(screen.getByText('该订单中没有这张照片')).toBeInTheDocument())
  expect(screen.queryByText('真实照片工作台')).not.toBeInTheDocument()
})


it('explains permission errors from the order photo list', async () => {
  const { AxiosError } = await import('axios')
  vi.mocked(listPhotos).mockRejectedValue(Object.assign(new AxiosError('forbidden'), { response: { status: 403 } }))
  show()
  expect(await screen.findByText('没有权限访问或导出这张照片')).toBeInTheDocument()
})
it('from-library editor reads one asset and retains a library return action',async()=>{
  const {loadAsset}=await import('@/api/photoCatalog')
  const mock=vi.spyOn(await import('@/api/photoCatalog'),'loadAsset').mockResolvedValue({id:2,orderId:1,filename:'real.jpg',mimeType:'image/jpeg',width:517,height:606,sizeBytes:1000,createdAt:'2026-10-17T00:00:00Z',rating:0,colorLabel:null,pickStatus:'unmarked' as const,annotationRevision:0,displayAspectRatio:517/606})
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={['/orders/1/photos/2/edit?from=library']}><Routes><Route path="/orders/:id/photos/:photoId/edit" element={<PhotoEditorPage/>}/></Routes></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText('真实照片工作台')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'← 返回图库'})).toBeInTheDocument()
  expect(listPhotos).not.toHaveBeenCalled();expect(mock).toHaveBeenCalledWith(1,2,expect.any(AbortSignal))
  mock.mockRestore();expect(loadAsset).toBeDefined()
})
