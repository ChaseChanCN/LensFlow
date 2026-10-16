import { lazy, Suspense, useState, type ReactNode } from 'react'
import { choose, EFFECT_STRENGTH, METAL_PRESETS, randomBeam } from './presets'
import { useEffectMotion } from './useEffectMotion'
import { EffectBoundary } from './EffectBoundary'
import { useAfterPaint } from './useAfterPaint'
import { useEffectsTheme } from './EffectsTheme'
import './effects.css'

const Beam = lazy(() => import('border-beam').then(m => ({ default: m.BorderBeam })))
const Metal = lazy(() => import('metal-fx').then(m => ({ default: m.MetalFx })))
const Orb = lazy(() => import('thinking-orbs').then(m => ({ default: m.ThinkingOrb })))

export function BeamSurface({ children }: { children: ReactNode }) {
  const [preset] = useState(randomBeam)
  const paused = useEffectMotion()
  const ready = useAfterPaint()
  const theme = useEffectsTheme()
  return <div className="effects-surface effects-surface-beam">{children}{ready && <div className="effects-surface-overlay" aria-hidden="true" inert><EffectBoundary fallback={null}><Suspense fallback={null}><Beam {...preset} theme={theme} strength={EFFECT_STRENGTH} active={!paused} className="effects-surface-renderer" style={{width:'100%',height:'100%'}} borderRadius={18}><span className="effects-surface-shape" /></Beam></Suspense></EffectBoundary></div>}</div>
}

export function MetalSurface({ children }: { children: ReactNode }) {
  const [preset] = useState(() => choose(METAL_PRESETS))
  const paused = useEffectMotion()
  const ready = useAfterPaint()
  const theme = useEffectsTheme()
  return <div className="effects-surface effects-surface-metal">{children}{ready && <div className="effects-surface-overlay" aria-hidden="true" inert><EffectBoundary fallback={null}><Suspense fallback={null}><Metal preset={preset} theme={theme} strength={EFFECT_STRENGTH} paused={paused} normalizeHostStyles={false} className="effects-surface-renderer" style={{width:'100%',height:'100%'}} borderRadius={999}><span className="effects-surface-shape" /></Metal></Suspense></EffectBoundary></div>}</div>
}

export function AnalysisActivity({ label }: { label: string }) {
  const paused = useEffectMotion()
  const ready = useAfterPaint()
  const theme = useEffectsTheme()
  return <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 p-6 text-body-sm text-label-muted">
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">{ready && <EffectBoundary fallback={null}><Suspense fallback={<span className="h-2 w-2 rounded-full bg-label-muted" />}><Orb state="searching" size={20} theme={theme} paused={paused} /></Suspense></EffectBoundary>}</span><span>{label}</span>
  </div>
}

