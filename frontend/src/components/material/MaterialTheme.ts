import { createContext, useContext } from 'react'

export const MATERIAL_THEME_KEY = 'lensflow-material-theme'
export const MaterialThemeContext = createContext<{ theme: 'dark' | 'light'; toggle: () => void }>({ theme: 'dark', toggle: () => {} })
export const useMaterialTheme = () => useContext(MaterialThemeContext)
