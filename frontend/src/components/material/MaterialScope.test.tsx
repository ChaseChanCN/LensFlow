import { beforeEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { MaterialScope } from './MaterialScope'
import { useEffectsTheme } from '@/components/effects/EffectsTheme'
import { ThemeToggle } from './ThemeToggle'
import { MATERIAL_THEME_KEY } from './MaterialTheme'

beforeEach(() => localStorage.removeItem(MATERIAL_THEME_KEY))

function ThemeProbe({ name }: { name: string }) {
  const theme = useEffectsTheme()
  return <output aria-label={name}>{theme}</output>
}
describe('material pilot scope', () => {
  it('uses dark renderer tuning inside the pilot and keeps the default outside', () => {
    render(<><MaterialScope><ThemeProbe name="pilot" /></MaterialScope><ThemeProbe name="existing" /></>)
    expect(screen.getByLabelText('pilot')).toHaveTextContent('dark')
    expect(screen.getByLabelText('existing')).toHaveTextContent('light')
    expect(screen.getByLabelText('pilot').closest('[data-theme]')).toHaveAttribute('data-theme', 'dark')
  })
  it('removes the scoped palette when leaving the pilot', () => {
    const { rerender } = render(<MaterialScope><ThemeProbe name="page" /></MaterialScope>)
    rerender(<ThemeProbe name="page" />)
    expect(screen.getByLabelText('page')).toHaveTextContent('light')
    expect(document.querySelector('.lf-material')).toBeNull()
  })
  it('switches renderer theme, persists the choice and restores it on another page', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<MaterialScope><ThemeToggle /><ThemeProbe name="page" /></MaterialScope>)
    await user.click(screen.getByRole('button', { name: '切换浅色模式' }))
    expect(screen.getByLabelText('page')).toHaveTextContent('light')
    expect(localStorage.getItem(MATERIAL_THEME_KEY)).toBe('light')
    unmount()
    render(<MaterialScope><ThemeToggle /><ThemeProbe name="restored" /></MaterialScope>)
    expect(screen.getByLabelText('restored')).toHaveTextContent('light')
    await user.click(screen.getByRole('button', { name: '切换深色模式' }))
    expect(screen.getByLabelText('restored')).toHaveTextContent('dark')
  })
})
