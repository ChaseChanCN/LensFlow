import { useMaterialTheme } from './MaterialTheme'

export function ThemeToggle() {
  const { theme, toggle } = useMaterialTheme()
  const label = theme === 'dark' ? '切换浅色模式' : '切换深色模式'
  return <button type="button" className="material-theme-toggle" aria-label={label} title={label} onClick={toggle}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></> : <path d="M20.8 13.2A9 9 0 0 1 10.8 3.1a9 9 0 1 0 10 10.1Z"/>}</svg>
  </button>
}
