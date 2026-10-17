import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RetouchPage } from '@/pages/photographer/RetouchPage'

vi.mock('@/api/retouch', () => ({
  listRetouchTasks: vi.fn().mockResolvedValue([
    {
      id: 1,
      order_id: 1,
      photo_id: 10,
      status: 'pending',
      due_date: null,
      created_at: '2024-01-01T00:00:00',
    },
  ]),
  uploadRetouchVersion: vi.fn(),
  listRetouchVersions: vi.fn().mockResolvedValue([]),
  createFeedback: vi.fn(),
  listFeedback: vi.fn().mockResolvedValue([]),
  confirmAllRetouch: vi.fn(),
}))

vi.mock('@/api/auth', () => ({
  extractErrorMessage: vi.fn((err: unknown) => String(err)),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector) =>
    selector({ user: { role: 'photographer', id: 1, email: 'p@test.com', name: 'P' } }),
  ),
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/orders/1/retouch']}>
        <Routes>
          <Route path="/orders/:id/retouch" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RetouchPage', () => {
  it('renders page title', async () => {
    renderWithProviders(<RetouchPage />)
    expect(await screen.findByRole('heading', { name: '修图协作' })).toBeInTheDocument()
  })

  it('renders task list', async () => {
    renderWithProviders(<RetouchPage />)
    expect(await screen.findByText('任务 #1 · 照片 10')).toBeInTheDocument()
    expect(await screen.findByText('待确认')).toBeInTheDocument()
  })

  it('renders file input for photographer', async () => {
    renderWithProviders(<RetouchPage />)
    expect(await screen.findByText('待确认')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '← 返回' })).toBeInTheDocument()
  })
})
