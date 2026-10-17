import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeliveryPage } from '@/pages/client/DeliveryPage'
import userEvent from '@testing-library/user-event'
import { downloadDelivery } from '@/api/deliveries'
import { saveBlob } from '@/utils/download'

vi.mock('@/utils/download', () => ({ saveBlob: vi.fn() }))

vi.mock('@/api/deliveries', () => ({
  getDelivery: vi.fn().mockResolvedValue({
    id: 1,
    order_id: 1,
    storage_key: 'key1',
    filename: 'final.zip',
    delivered_at: '2024-01-01T00:00:00',
  }),
  uploadDelivery: vi.fn(),
  archiveOrder: vi.fn(),
  downloadDelivery: vi.fn(),
  getDownloadUrl: vi.fn(() => '/api/v1/deliveries/1/download'),
}))

vi.mock('@/api/orders', () => ({
  getOrder: vi.fn().mockResolvedValue({
    id: 1,
    booking_id: 1,
    client_id: 2,
    photographer_id: 1,
    status: 'DELIVERED',
    created_at: '2024-01-01T00:00:00',
    updated_at: '2024-01-01T00:00:00',
    archived_at: null,
  }),
}))

vi.mock('@/api/auth', () => ({
  extractErrorMessage: vi.fn((err: unknown) => String(err)),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector) =>
    selector({ user: { role: 'client', id: 2, email: 'c@test.com', name: 'C' } }),
  ),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/orders/1/delivery']}>
        <Routes>
          <Route path="/orders/:id/delivery" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DeliveryPage', () => {
  it('authenticates download, preserves filename, and blocks duplicate clicks while pending', async () => {
    let resolve!: (blob: Blob) => void
    vi.mocked(downloadDelivery).mockReturnValueOnce(new Promise(done => { resolve = done }))
    renderWithProviders(<DeliveryPage />)
    const user=userEvent.setup();const button=await screen.findByRole('button',{name:'下载成片'})
    await user.click(button);expect(button).toBeDisabled();expect(button).toHaveAttribute('aria-busy','true')
    await user.click(button);expect(downloadDelivery).toHaveBeenCalledExactlyOnceWith(1)
    const blob=new Blob(['zip']);resolve(blob)
    await screen.findByRole('button',{name:'下载成片'})
    await vi.waitFor(()=>expect(saveBlob).toHaveBeenCalledWith(blob,'final.zip'))
  })
  it('announces failed authenticated downloads and allows retry', async () => {
    vi.mocked(downloadDelivery).mockRejectedValueOnce(new Error('下载失败'))
    renderWithProviders(<DeliveryPage />)
    const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'下载成片'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('下载失败')
    expect(screen.getByRole('button',{name:'下载成片'})).toBeEnabled()
  })
  it('renders page title', async () => {
    renderWithProviders(<DeliveryPage />)
    expect(await screen.findByRole('heading', { name: '交付' })).toBeInTheDocument()
  })

  it('renders delivery info', async () => {
    renderWithProviders(<DeliveryPage />)
    expect(await screen.findByText('final.zip')).toBeInTheDocument()
  })

  it('renders download button', async () => {
    renderWithProviders(<DeliveryPage />)
    expect(await screen.findByText('下载成片')).toBeInTheDocument()
  })
})
