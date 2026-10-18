import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getOrderSelectionSet, submitSelection } from '@/api/selections'
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
  it('restores a cross-device draft and submits its expected revision', async () => {
    vi.mocked(getOrderSelectionSet).mockResolvedValueOnce({
      id: 1, order_id: 1, max_select: 2, expires_at: null,
      published_at: '2026-10-18T00:00:00Z', created_at: '2026-10-18T00:00:00Z',
      revision: 4, draft_selected_photo_ids: [10], submitted: false,
      items: [{ id: 1, selection_set_id: 1, photo_id: 10 }],
    })
    renderWithProviders(<SelectionPage />)
    expect(await screen.findByText(/最多 2 张，已选 1 张/)).toBeInTheDocument()
    await userEvent.click(screen.getByText('提交选片'))
    await waitFor(() => expect(submitSelection).toHaveBeenCalledWith(1, [10], 4))
  })

  it('keeps local choice on a conflict and offers explicit server reload', async () => {
    vi.mocked(submitSelection).mockRejectedValueOnce(new Error('Selection changed'))
    renderWithProviders(<SelectionPage />)
    await screen.findByText('照片 10')
    await userEvent.click(screen.getByText('照片 10'))
    await userEvent.click(screen.getByText('提交选片'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Selection changed')
    expect(screen.getByRole('status')).toHaveTextContent('已选 1 张')
    await userEvent.click(screen.getByText('重新加载服务端选择'))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('renders page title', async () => {
    renderWithProviders(<SelectionPage />)
    expect(await screen.findByRole('heading', { name: '选片' })).toBeInTheDocument()
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
    expect(await screen.findByText(/最多 2 张，已选 0 张/)).toBeInTheDocument()
  })
})
