import { type ReactNode, type HTMLAttributes } from 'react'

interface ListItemProps extends HTMLAttributes<HTMLDivElement> {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  showChevron?: boolean
  onClick?: () => void
  destructive?: boolean
  isLast?: boolean
}

export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  showChevron = false,
  onClick,
  destructive = false,
  isLast = false,
  className = '',
  ...props
}: ListItemProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <>
      <Tag
        {...(onClick ? { onClick, type: 'button' as const } : {})}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ${onClick ? 'hover:bg-system-bg-grouped active:bg-system-bg-grouped' : ''} ${className}`}
        {...props}
      >
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-sm font-medium ${destructive ? 'text-error' : 'text-label'}`}>
            {title}
          </span>
          {subtitle && (
            <span className="truncate text-sm text-label-secondary">{subtitle}</span>
          )}
        </div>
        {trailing && <div className="shrink-0 text-sm text-label-tertiary">{trailing}</div>}
        {showChevron && (
          <svg className="h-5 w-5 shrink-0 text-label-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </Tag>
      {!isLast && <div className="ml-4 border-b border-separator-opaque" />}
    </>
  )
}
