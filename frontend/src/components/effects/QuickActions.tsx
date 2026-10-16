import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEffectMotion } from './useEffectMotion'
import { quickActions } from './quickActionItems'
import { EffectBoundary } from './EffectBoundary'
import './effects.css'

const Liquid = lazy(() => import('./QuickActionsLiquid'))
export function QuickActions() {
  const navigate = useNavigate()
  const paused = useEffectMotion()
  const go = (path: string) => navigate(path)
  const fallback = <div className="effects-static-actions">{quickActions.map(a => <button key={a.path} type="button" onClick={() => go(a.path)}>{a.label}</button>)}</div>
  return <section className="effects-shortcuts" aria-label="快捷操作">
    <div><h2><span className="effects-shortcuts-eyebrow" aria-hidden="true">QUICK ACCESS / 02</span>快捷操作</h2><p>订单与预约，随手可达</p></div>
    {paused ? fallback : <EffectBoundary fallback={fallback}><Suspense fallback={fallback}><Liquid onAction={go} /></Suspense></EffectBoundary>}
  </section>
}
