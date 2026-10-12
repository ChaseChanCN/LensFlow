import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SelectionPage } from '@/pages/client/SelectionPage'

vi.mock('@/api/selections', () => ({
  getOrderSelectionSet: vi.fn().mockResolvedValue({
    id: 1,
    order_id: 1,
    max_select: 2,
    expires_at: null,
    published_at: '2024-01-01T00:00:00',
    created_at: '2024-01-01T00:00:00',
    items: [
      { id: 1, selection_set_id: 1, photo_id: 10 },
      { id: 2, selection_set_id: 1, photo_id: 11 },
      { id: 3, selection_set_id: 1, photo_id: 12 },
    ],
  }),
  submitSelection: vi.fn(),
}))

vi.mock('@/api/auth', () => ({
  extractErrorMessage: vi.fn((err: unknown) => String(err)),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/orders/1/selection']}>
        <Routes>
          <Route path="/orders/:id/selection" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SelectionPage', () => {
  it('renders page title', async () => {
    renderWithProviders(<SelectionPage />)
    expect(await screen.findByText(/选片 - 订单/)).toBeInTheDocument()
  })

  it('renders photo options', async () => {
    renderWithProviders(<SelectionPage />)
    expect(await screen.findByText('照片 10')).toBeInTheDocument()
    expect(await screen.findByText('照片 11')).toBeInTheDocument()
    expect(await screen.findByText('照片 12')).toBeInTheDocument()
  })

  it('renders submit button', async () => {
    renderWithProviders(<SelectionPage />)
    expect(await screen.findByText('提交选片')).toBeInTheDocument()
  })

  it('renders max select info', async () => {
    renderWithProviders(<SelectionPage />)
    expect(await screen.findByText(/最多选择 2 张/)).toBeInTheDocument()
  })
})
