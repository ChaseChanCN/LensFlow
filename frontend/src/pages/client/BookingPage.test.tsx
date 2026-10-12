import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingPage } from '@/pages/client/BookingPage'

vi.mock('@/api/auth', () => ({
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : 'error',
}))

vi.mock('@/api/bookings', () => ({
  createBooking: vi.fn(),
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

describe('BookingPage', () => {
  it('renders booking form', () => {
    renderWithProviders(<BookingPage />)
    expect(screen.getByText('填写拍摄需求，摄影师将尽快确认')).toBeInTheDocument()
    expect(screen.getByLabelText('拍摄类型')).toBeInTheDocument()
    expect(screen.getByLabelText('联系方式')).toBeInTheDocument()
    expect(screen.getByLabelText('期望日期')).toBeInTheDocument()
    expect(screen.getByLabelText('备注')).toBeInTheDocument()
  })

  it('has submit button', () => {
    renderWithProviders(<BookingPage />)
    expect(screen.getByRole('button', { name: '提交预约' })).toBeInTheDocument()
  })

  it('has shoot type options', () => {
    renderWithProviders(<BookingPage />)
    expect(screen.getByText('婚纱摄影')).toBeInTheDocument()
    expect(screen.getByText('人像写真')).toBeInTheDocument()
    expect(screen.getByText('家庭合影')).toBeInTheDocument()
  })
})
