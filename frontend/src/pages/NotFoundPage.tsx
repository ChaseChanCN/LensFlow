import { Link } from 'react-router-dom'
import { PublicShell } from '@/components/material/PublicShell'

export function NotFoundPage() {
  return (
    <PublicShell><main className="material-not-found flex flex-col items-center justify-center px-6">
      <p className="material-eyeline">A DIFFERENT FRAME</p>
      <p aria-hidden="true" className="text-display-xl font-bold tracking-tight text-label-muted">404</p>
      <h1 className="mt-4 text-heading-sm font-semibold text-label">页面不存在</h1>
      <Link
        to="/"
        className="mt-8 rounded-full bg-action-primary-strong px-6 py-3 text-body-sm font-medium text-label-inverse transition-colors duration-[var(--duration-fast)] hover:bg-action-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong"
      >
        返回首页
      </Link>
    </main></PublicShell>
  )
}
