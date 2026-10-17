import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from 'react'
import { beamThemeTuning, choose, EFFECT_STRENGTH, METAL_PRESETS, randomBeam } from './presets'
import { useEffectMotion } from './useEffectMotion'
import { EffectBoundary } from './EffectBoundary'
import { useAfterPaint } from './useAfterPaint'
import { useEffectsTheme } from './EffectsTheme'
import './effects.css'

const Beam = lazy(() => import('border-beam').then(m => ({ default: m.BorderBeam })))
const Metal = lazy(() => import('metal-fx').then(m => ({ default: m.MetalFx })))
const Orb = lazy(() => import('thinking-orbs').then(m => ({ default: m.ThinkingOrb })))
// One decorative surface owns a subtree. Descendant buttons/cards remain
// native controls rather than adding another Beam or Metal renderer.
const SurfaceEffect = createContext<'beam' | 'metal' | null>(null)

export function BeamSurface({ children, radius = 18, enabled = true }: { children: ReactNode; radius?: number; enabled?: boolean }) {
  const parent = useContext(SurfaceEffect)
  const decorated = enabled && !parent
  const [preset] = useState(randomBeam)
  const paused = useEffectMotion()
  const ready = useAfterPaint(decorated)
  const theme = useEffectsTheme()
  const tuning = beamThemeTuning(theme)
  return <SurfaceEffect.Provider value={parent ?? (decorated ? 'beam' : null)}><div className={`effects-surface ${decorated ? 'effects-surface-beam' : 'effects-surface-plain'}`} style={{borderRadius:radius}} data-effect-kind={decorated ? 'beam' : undefined} data-effect-theme={theme} data-beam-size={decorated ? preset.size : undefined} data-beam-color={decorated ? 'mono' : undefined}>{children}{ready && <div className="effects-surface-overlay" aria-hidden="true" inert><EffectBoundary fallback={null}><Suspense fallback={null}><Beam {...preset} staticColors theme="dark" strength={EFFECT_STRENGTH} active={!paused} brightness={tuning.brightness} glowSize={tuning.glowSize} className="effects-surface-renderer" style={{width:'100%',height:'100%',...tuning.style}} borderRadius={radius}><span className="effects-surface-shape" /></Beam></Suspense></EffectBoundary></div>}</div></SurfaceEffect.Provider>
}

export function MetalSurface({ children }: { children: ReactNode }) {
  const parent = useContext(SurfaceEffect)
  const [preset] = useState(() => choose(METAL_PRESETS))
  const paused = useEffectMotion()
  const ready = useAfterPaint(!parent)
  const theme = useEffectsTheme()
  return <SurfaceEffect.Provider value={parent ?? 'metal'}><div className={`effects-surface ${parent ? 'effects-surface-plain' : 'effects-surface-metal'}`} data-effect-kind={parent ? undefined : 'metal'}>{children}{ready && <div className="effects-surface-overlay" aria-hidden="true" inert><EffectBoundary fallback={null}><Suspense fallback={null}><Metal preset={preset} theme={theme} strength={EFFECT_STRENGTH} paused={paused} normalizeHostStyles={false} className="effects-surface-renderer" style={{width:'100%',height:'100%'}} borderRadius={999}><span className="effects-surface-shape" /></Metal></Suspense></EffectBoundary></div>}</div></SurfaceEffect.Provider>
}

export function AnalysisActivity({ label }: { label: string }) {
  const paused = useEffectMotion()
  const ready = useAfterPaint()
  const theme = useEffectsTheme()
  return <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 p-6 text-body-sm text-label-muted">
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">{ready && <EffectBoundary fallback={null}><Suspense fallback={<span className="h-2 w-2 rounded-full bg-label-muted" />}><Orb state="searching" size={20} theme={theme} paused={paused} /></Suspense></EffectBoundary>}</span><span>{label}</span>
  </div>
}
