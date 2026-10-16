import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Spinner } from './Spinner'
import { EmptyState } from './EmptyState'

describe('Spinner', () => {
  it('announces loading by default and hides decorative instances', () => {
    const { rerender } = render(<Spinner />)
    expect(screen.getByRole('status', { name: '加载中' })).toBeInTheDocument()
    rerender(<Spinner size="lg" color="gray" label="上传中" />)
    expect(screen.getByRole('status', { name: '上传中' })).toBeInTheDocument()
    rerender(<Spinner size="sm" color="white" decorative />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
describe('EmptyState', () => {
  it('renders a named region without requiring optional content', () => {
    render(<EmptyState title="暂无订单" />)
    expect(screen.getByRole('region', { name: '暂无订单' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('renders a custom icon, description and non-submitting action', async () => {
    const action = vi.fn()
    const submit = vi.fn((event) => event.preventDefault())
    render(<form onSubmit={submit}><EmptyState title="暂无相册" icon={<span>相册图标</span>} description="创建第一本相册" action={{ label: '创建', onClick: action }} /></form>)
    expect(screen.getByText('创建第一本相册')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(action).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
  })
})
