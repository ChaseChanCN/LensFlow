/* oxlint-disable react/only-export-components -- Test-only renderer mocks, not a Fast Refresh entry. */
// Page tests exercise business behavior. Actual renderers are checked in a browser;
// jsdom has neither Canvas/WebGL nor layout for SVG liquid measurement.
import { vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('border-beam', () => ({ BorderBeam: ({ children, size, colorVariant, strength, active }: { children: ReactNode; size: string; colorVariant: string; strength: number; active: boolean }) => <div data-testid="beam-renderer" data-size={size} data-color={colorVariant} data-strength={strength} data-active={active}>{children}</div> }))
vi.mock('metal-fx', () => ({ MetalFx: ({ children, preset, strength, paused }: { children: ReactNode; preset: string; strength: number; paused: boolean }) => <div data-testid="metal-renderer" data-preset={preset} data-strength={strength} data-paused={paused}>{children}</div> }))
vi.mock('thinking-orbs', () => ({ ThinkingOrb: ({ paused }: { paused: boolean }) => <span data-testid="orb-renderer" data-paused={paused} /> }))
vi.mock('liquid-gooey', () => {
  const Item = ({ children }: { children: ReactNode }) => <div>{children}</div>
  const Liquid = Object.assign(({ children }: { children: ReactNode }) => <div>{children}</div>, { Item })
  return { Liquid }
})
