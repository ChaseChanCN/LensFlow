import { createContext, useContext } from 'react'

export const EffectsTheme = createContext<'light' | 'dark'>('light')
export const useEffectsTheme = () => useContext(EffectsTheme)
