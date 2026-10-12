import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeliveryPage } from '@/pages/client/DeliveryPage'

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
  it('renders page title', async () => {
    renderWithProviders(<DeliveryPage />)
    expect(await screen.findByText(/交付 - 订单/)).toBeInTheDocument()
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
