import { useId, type ReactNode } from 'react'
import { Button } from './Button'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-card bg-fill-tertiary text-label-muted">
        {icon ?? <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7h7l2 2h9v11H3V7Zm0 0V4h7l2 3" /></svg>}
      </div>
      <h2 id={titleId} className="text-heading-sm font-semibold text-label">{title}</h2>
      {description && <p className="max-w-content-sm text-body-sm text-label-muted">{description}</p>}
      {action && <Button type="button" onClick={action.onClick}>{action.label}</Button>}
    </section>
  )
}
