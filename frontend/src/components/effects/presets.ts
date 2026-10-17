export const EFFECT_STRENGTH = 0.7
export const BEAM_SIZES = ['md', 'sm', 'line', 'pulse-inner', 'pulse-outside'] as const
export const BEAM_COLORS = ['mono'] as const
export const METAL_PRESETS = ['chromatic', 'silver', 'gold'] as const

// Choose once per mounted instance; never flicker when form/query state changes.
export function choose<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!
}

export function randomBeam() {
  return { size: choose(BEAM_SIZES), colorVariant: 'mono' as const }
}
import type { CSSProperties } from 'react'


// Apply only to a decorative renderer, never to the wrapped control/content.
// Preserve animation alpha while tinting mono light to pale silver blue.
export const LIGHT_BEAM_FILTER = 'brightness(0) saturate(100%) invert(78%) sepia(18%) saturate(430%) hue-rotate(176deg) brightness(95%) contrast(92%)'
export function beamThemeTuning(theme: 'dark' | 'light') {
  return theme === 'light'
    ? { brightness: undefined, glowSize: 1, style: { filter: LIGHT_BEAM_FILTER } as CSSProperties }
    : { brightness: undefined, glowSize: 1, style: {} as CSSProperties }
}
