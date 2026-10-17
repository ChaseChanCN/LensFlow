import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UploadPage } from '@/pages/photographer/UploadPage'

vi.mock('@/api/photos', () => ({
  listPhotos: vi.fn().mockResolvedValue([
    {
      id: 1,
      order_id: 1,
      filename: 'test.jpg',
      storage_key: 'key1',
      mime: 'image/jpeg',
      size_bytes: 102400,
      width: 640,
      height: 480,
      created_at: '2024-01-01T00:00:00',
      updated_at: '2024-01-01T00:00:00',
    },
  ]),
  uploadPhoto: vi.fn(),
  deletePhoto: vi.fn(),
}))

vi.mock('@/api/orders', () => ({
  getOrder: vi.fn().mockResolvedValue({
    id: 1,
    booking_id: 1,
    client_id: 2,
    photographer_id: 1,
    status: 'WAITING_UPLOAD',
    created_at: '2024-01-01T00:00:00',
    updated_at: '2024-01-01T00:00:00',
    archived_at: null,
  }),
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
      <MemoryRouter initialEntries={['/orders/1/upload']}>
        <Routes>
          <Route path="/orders/:id/upload" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('UploadPage', () => {
  it('renders page title', () => {
    renderWithProviders(<UploadPage />)
    expect(screen.getByRole('heading', { name: '上传照片' })).toBeInTheDocument()
  })

  it('renders file input', () => {
    renderWithProviders(<UploadPage />)
    expect(screen.getByText('选择照片')).toBeInTheDocument()
  })

  it('renders uploaded photos list', async () => {
    renderWithProviders(<UploadPage />)
    expect(await screen.findByText('test.jpg')).toBeInTheDocument()
  })

  it('renders link to analysis results', async () => {
    renderWithProviders(<UploadPage />)
    expect(await screen.findByText('查看分析结果')).toBeInTheDocument()
  })
})
