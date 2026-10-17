import { type ReactNode } from 'react'

interface LargeTitleProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function LargeTitle({ title, subtitle, action }: LargeTitleProps) {
  return (
    <div className="material-shared-heading flex items-end justify-between px-4 pb-4 pt-2">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-label">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-body-sm text-label-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
