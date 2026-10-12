import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from '@/pages/NotFoundPage'

describe('NotFoundPage', () => {
  it('renders 404 text', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('页面不存在')).toBeInTheDocument()
  })

  it('has a link to home', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    const link = screen.getByText('返回首页')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })
})
