import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  children: ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  filled:
    'bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed shadow-sm',
  tinted:
    'bg-accent/10 text-accent hover:bg-accent/15 active:bg-accent/20',
  gray:
    'bg-system-fill text-label hover:bg-system-fill-secondary active:bg-system-fill-tertiary',
  plain:
    'text-accent hover:text-accent-hover active:text-accent-pressed',
  destructive:
    'bg-error text-white hover:bg-error/90 active:bg-error/80 shadow-sm',
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
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
