import { Liquid } from 'liquid-gooey'
import { quickActions } from './quickActionItems'

export default function QuickActionsLiquid({ onAction }: { onAction: (path: string) => void }) {
  return <Liquid className="effects-liquid-actions" blur={6} contrast={18} filterPadding={28} fill="var(--color-action-primary-strong)">
    {quickActions.map(a => <Liquid.Item key={a.path} radius={24} effect="bend">
      <button type="button" className="effects-labeled-action" onClick={() => onAction(a.path)}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{a.icon === 'orders' ? <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/></> : <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M12 14v4M10 16h4"/></>}</svg><span>{a.label}</span>
      </button>
    </Liquid.Item>)}
  </Liquid>
}
