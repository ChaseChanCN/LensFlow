import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEffectMotion } from './useEffectMotion'
import { quickActions, type QuickActionItem } from './quickActionItems'
import { EffectBoundary } from './EffectBoundary'
import './effects.css'

const Liquid = lazy(() => import('./QuickActionsLiquid'))
export function QuickActions({items=quickActions,description='订单与预约，随手可达'}: {items?: readonly QuickActionItem[];description?: string}) {
  const navigate = useNavigate()
  const paused = useEffectMotion()
  const go = (path: string) => {
    if (path.startsWith('#')) document.getElementById(path.slice(1))?.scrollIntoView({behavior:paused?'instant':'smooth',block:'start'})
    else navigate(path)
  }
  const fallback = <div className="effects-static-actions">{items.map(a => <button key={a.path} type="button" onClick={() => go(a.path)}>{a.label}</button>)}</div>
  return <section className="effects-shortcuts" aria-label="快捷操作">
    <div><h2><span className="effects-shortcuts-eyebrow" aria-hidden="true">QUICK ACCESS / 02</span>快捷操作</h2><p>{description}</p></div>
    {paused ? fallback : <EffectBoundary fallback={fallback}><Suspense fallback={fallback}><Liquid items={items} onAction={go} /></Suspense></EffectBoundary>}
  </section>
}
