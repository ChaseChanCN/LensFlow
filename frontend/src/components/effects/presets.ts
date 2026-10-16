export const EFFECT_STRENGTH = 0.7
export const BEAM_SIZES = ['md', 'sm', 'line', 'pulse-inner', 'pulse-outside'] as const
export const BEAM_COLORS = ['colorful', 'mono', 'ocean', 'sunset'] as const
export const METAL_PRESETS = ['chromatic', 'silver', 'gold'] as const

// Choose once per mounted instance; never flicker when form/query state changes.
export function choose<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!
}

export function randomBeam() {
  return { size: choose(BEAM_SIZES), colorVariant: choose(BEAM_COLORS) }
}
