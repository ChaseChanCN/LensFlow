import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '@/pages/auth/LoginPage'

describe('LoginPage', () => {
  it('renders login form', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('LensFlow 登录')).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
  })

  it('has link to register', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    const link = screen.getByText('注册')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/register')
  })
})
