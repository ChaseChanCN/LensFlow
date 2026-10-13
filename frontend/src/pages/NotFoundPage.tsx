import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-system-bg-grouped px-6">
      <p className="text-7xl font-bold tracking-tight text-label-tertiary">404</p>
      <p className="mt-4 text-base text-label-secondary">页面不存在</p>
      <Link
        to="/"
        className="mt-8 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover active:scale-95"
      >
        返回首页
      </Link>
    </div>
  )
}
