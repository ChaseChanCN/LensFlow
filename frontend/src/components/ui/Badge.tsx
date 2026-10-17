import { type ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'error'

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  className?: string
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-system-fill text-label-muted',
  accent: 'bg-info-bg text-info-label',
  success: 'bg-success-bg text-success-label',
  warning: 'bg-warning-bg text-warning-label',
  error: 'bg-error-bg text-error-label',
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}>
      {children}
    </span>
  )
}

const STATUS_TONE_MAP: Record<string, Tone> = {
  pending: 'warning',
  confirmed: 'accent',
  completed: 'success',
  cancelled: 'error',
  paid: 'success',
  unpaid: 'warning',
  delivered: 'success',
  uploaded: 'accent',
  analyzing: 'warning',
  analyzed: 'success',
  retouching: 'warning',
  retouched: 'success',
}

const STATUS_LABEL_MAP: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
  paid: '已付款',
  unpaid: '待付款',
  delivered: '已交付',
  uploaded: '已上传',
  analyzing: '分析中',
  analyzed: '已分析',
  retouching: '修图中',
  retouched: '已修图',
}

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE_MAP[status] || 'neutral'
  const label = STATUS_LABEL_MAP[status] || status
  return <Badge tone={tone}>{label}</Badge>
}
