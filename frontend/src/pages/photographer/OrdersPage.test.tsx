import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrdersPage } from '@/pages/photographer/OrdersPage'

vi.mock('@/api/orders', () => ({
  listOrders: vi.fn().mockResolvedValue([
    {
      id: 1,
      booking_id: 1,
      client_id: 2,
      photographer_id: 1,
      status: 'CONFIRMED',
      created_at: '2024-01-01T00:00:00',
      updated_at: '2024-01-01T00:00:00',
      archived_at: null,
    },
  ]),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OrdersPage', () => {
  it('renders page title', () => {
    renderWithProviders(<OrdersPage />)
    expect(screen.getByText('订单列表')).toBeInTheDocument()
  })

  it('renders orders table after load', async () => {
    renderWithProviders(<OrdersPage />)
    expect(await screen.findByText('#1')).toBeInTheDocument()
    expect(await screen.findByText('已确认')).toBeInTheDocument()
  })
})
