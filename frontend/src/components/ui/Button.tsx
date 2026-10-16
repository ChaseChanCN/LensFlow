import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  children: ReactNode
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  filled:
    'bg-action-primary-strong text-label-inverse hover:bg-action-primary-pressed active:bg-action-primary-pressed shadow-sm',
  tinted:
    'bg-info-bg text-info-label hover:text-action-primary-pressed active:text-action-primary-pressed',
  gray:
    'bg-system-fill text-label hover:bg-system-fill-secondary active:bg-system-fill-tertiary',
  plain:
    'text-action-primary-strong hover:text-action-primary-pressed active:text-action-primary-pressed',
  destructive:
    'bg-error-label text-label-inverse hover:bg-error-label/95 active:bg-error-label/90 shadow-sm',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-control',
  md: 'px-4 py-2.5 text-sm rounded-control',
  lg: 'px-5 py-3 text-base rounded-control',
}

export function Button({
  variant = 'filled',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  'aria-busy': ariaBusy,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || ariaBusy}
      className={`relative inline-flex items-center justify-center font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] active:scale-[0.97] motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      <span className={`inline-flex items-center justify-center gap-2 ${loading ? 'opacity-0' : ''}`}>
        {leftIcon && <span aria-hidden="true" className="inline-flex shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span aria-hidden="true" className="inline-flex shrink-0">{rightIcon}</span>}
      </span>
      {loading && <span className="absolute inset-0 flex items-center justify-center"><Spinner size={size === 'lg' ? 'md' : 'sm'} color="current" decorative /></span>}
    </button>
  )
}
