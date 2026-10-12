import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnalysisResultPage } from '@/pages/photographer/AnalysisResultPage'

vi.mock('@/api/photos', () => ({
  listPhotos: vi.fn().mockResolvedValue([
    {
      id: 1,
      order_id: 1,
      filename: 'normal.jpg',
      storage_key: 'key1',
      mime: 'image/jpeg',
      size_bytes: 102400,
      width: 640,
      height: 480,
      created_at: '2024-01-01T00:00:00',
      updated_at: '2024-01-01T00:00:00',
    },
  ]),
  getAnalysis: vi.fn().mockResolvedValue({
    id: 1,
    photo_id: 1,
    sharpness_score: 150.5,
    brightness_mean: 128.0,
    highlight_ratio: 0.05,
    shadow_ratio: 0.03,
    suggestion: 'no_issue',
    risk_level: 'low',
    reviewed: false,
    reviewer_id: null,
    reviewed_at: null,
    final_decision: 'pending',
    created_at: '2024-01-01T00:00:00',
  }),
  reviewAnalysis: vi.fn(),
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
      <MemoryRouter initialEntries={['/orders/1/analysis']}>
        <Routes>
          <Route path="/orders/:id/analysis" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AnalysisResultPage', () => {
  it('renders page title', async () => {
    renderWithProviders(<AnalysisResultPage />)
    expect(await screen.findByText(/AI 分析结果/)).toBeInTheDocument()
  })

  it('renders photo with analysis data', async () => {
    renderWithProviders(<AnalysisResultPage />)
    expect(await screen.findByText('normal.jpg')).toBeInTheDocument()
    expect(await screen.findByText('正常')).toBeInTheDocument()
  })

  it('renders review buttons', async () => {
    renderWithProviders(<AnalysisResultPage />)
    expect(await screen.findByText('保留')).toBeInTheDocument()
    expect(await screen.findByText('剔除')).toBeInTheDocument()
    expect(await screen.findByText('待定')).toBeInTheDocument()
  })

  it('renders back to upload link', async () => {
    renderWithProviders(<AnalysisResultPage />)
    expect(await screen.findByText('返回上传')).toBeInTheDocument()
  })
})
