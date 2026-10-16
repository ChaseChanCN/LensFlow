import { useEffect, useState, type ReactNode } from 'react'
import { EffectsTheme } from '@/components/effects/EffectsTheme'
import { MATERIAL_THEME_KEY, MaterialThemeContext } from './MaterialTheme'
import './material.css'

export function MaterialScope({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem(MATERIAL_THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === MATERIAL_THEME_KEY) setTheme(event.newValue === 'light' ? 'light' : 'dark') }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(MATERIAL_THEME_KEY, next) } catch { /* Switching still works without persistence. */ }
    setTheme(next)
  }
  return <MaterialThemeContext.Provider value={{theme,toggle}}><EffectsTheme.Provider value={theme}><div className="lf-material" data-theme={theme}>{children}</div></EffectsTheme.Provider></MaterialThemeContext.Provider>
}
