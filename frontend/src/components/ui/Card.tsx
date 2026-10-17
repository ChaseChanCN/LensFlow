import { type HTMLAttributes, type ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  padding?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const PADDING_CLASSES = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({
  interactive = false,
  padding = 'md',
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      data-cursor-card
      className={`bg-system-bg rounded-card shadow-card ${PADDING_CLASSES[padding]} ${interactive ? 'transition-all duration-150 active:scale-[0.98] cursor-pointer hover:shadow-elevated' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
