import { type ReactNode, type HTMLAttributes } from 'react'

interface ListGroupProps extends HTMLAttributes<HTMLDivElement> {
  header?: string
  footer?: string
  children: ReactNode
}

export function ListGroup({ header, footer, className = '', children, ...props }: ListGroupProps) {
  return (
    <div className="px-4" {...props}>
      {header && (
        <p className="mb-2 px-1 text-caption font-medium uppercase tracking-wide text-label-muted">
          {header}
        </p>
      )}
      <div className={`overflow-hidden rounded-card bg-system-bg shadow-card ${className}`}>
        {children}
      </div>
      {footer && (
        <p className="mt-2 px-1 text-caption text-label-muted">{footer}</p>
      )}
    </div>
  )
}
