import { type ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  action?: ReactNode
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-6">
      <h2 className="text-base font-semibold tracking-tight text-label">{title}</h2>
      {action}
    </div>
  )
}
