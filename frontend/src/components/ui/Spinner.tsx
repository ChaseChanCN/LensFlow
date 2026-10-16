import type { HTMLAttributes } from 'react'

export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color' | 'children'> {
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'white' | 'gray' | 'current'
  label?: string
  decorative?: boolean
}

const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' }
const COLORS = { primary: 'text-action-primary-strong', white: 'text-label-inverse', gray: 'text-label-muted', current: 'text-current' }

export function Spinner({ size = 'md', color = 'primary', label = '加载中', decorative = false, className = '', ...props }: SpinnerProps) {
  return (
    <span {...props} className={`inline-flex shrink-0 ${COLORS[color]} ${className}`} role={decorative ? undefined : 'status'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
      <svg className={`${SIZES[size]} animate-spin motion-reduce:animate-none`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  )
}
