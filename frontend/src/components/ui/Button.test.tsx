import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('keeps its accessible name while busy and blocks submission', async () => {
    const submit = vi.fn((event) => event.preventDefault())
    const click = vi.fn()
    const { rerender } = render(<form onSubmit={submit}><Button loading onClick={click}>提交预约</Button></form>)
    const button = screen.getByRole('button', { name: '提交预约' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(submit).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    rerender(<form onSubmit={submit}><Button onClick={click}>提交预约</Button></form>)
    await userEvent.click(screen.getByRole('button', { name: '提交预约' }))
    expect(submit).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
  })
  it('keeps icons decorative and preserves native aria props and disabled', () => {
    render(<Button leftIcon={<span>左图标</span>} rightIcon={<span>右图标</span>} aria-busy="true" disabled>保存</Button>)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
  it.each(['filled', 'tinted', 'gray', 'plain', 'destructive'] as const)('supports the existing %s variant', (variant) => {
    render(<Button variant={variant}>操作</Button>)
    expect(screen.getByRole('button', { name: '操作' })).toBeEnabled()
  })
  it('supports large loading buttons and full width without discarding caller classes', () => {
    render(<Button size="lg" loading fullWidth className="custom-button">上传</Button>)
    expect(screen.getByRole('button', { name: '上传' })).toHaveClass('w-full', 'custom-button')
  })
})
