import { type ReactNode, type HTMLAttributes } from 'react'
import { BeamSurface } from '@/components/effects/EffectSurfaces'

interface ListItemProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  showChevron?: boolean
  onClick?: () => void
  destructive?: boolean
  isLast?: boolean
  disabled?: boolean
  effect?: 'beam'
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
  disabled = false,
  effect,
  className = '',
  ...props
}: ListItemProps) {
  const Tag = onClick ? 'button' : 'div'
  const row = <Tag
        {...(onClick ? { onClick, type: 'button' as const, disabled } : {})}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--duration-fast)] ${onClick ? 'enabled:hover:bg-system-bg-grouped enabled:active:bg-system-bg-grouped disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-action-primary-strong' : ''} ${className}`}
        {...props}
      >
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-body-sm font-medium ${destructive ? 'text-error-label' : 'text-label'}`}>
            {title}
          </span>
          {subtitle && (
            <span className="truncate text-body-sm text-label-muted">{subtitle}</span>
          )}
        </div>
        {trailing && <div className="min-w-0 max-w-[60%] text-right text-body-sm text-label-muted [overflow-wrap:anywhere]">{trailing}</div>}
        {showChevron && (
          <svg className="h-5 w-5 shrink-0 text-label-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </Tag>
  return (
    <>
      {effect ? <BeamSurface radius={16} enabled={!disabled}>{row}</BeamSurface> : row}
      {!isLast && <div className="ml-4 border-b border-separator-opaque" />}
    </>
  )
}
