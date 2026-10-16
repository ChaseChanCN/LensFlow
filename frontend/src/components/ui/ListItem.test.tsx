import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListItem } from './ListItem'

describe('ListItem native element behavior', () => {
  it('keeps passive rows as divs and accepts React content for the title', () => {
    render(<ListItem title={<strong>预约编号</strong>} data-testid="row" isLast />)
    expect(screen.getByTestId('row').tagName).toBe('DIV')
    expect(screen.getByText('预约编号').tagName).toBe('STRONG')
  })

  it('uses a non-submitting button for clickable rows', async () => {
    const onClick = vi.fn()
    const onSubmit = vi.fn((event) => event.preventDefault())
    render(<form onSubmit={onSubmit}><ListItem title="打开订单" onClick={onClick} isLast /></form>)
    const button = screen.getByRole('button', { name: '打开订单' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps clickable rows keyboard operable', async () => {
    const onClick = vi.fn()
    render(<ListItem title="打开订单" onClick={onClick} isLast />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: '打开订单' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })
})
