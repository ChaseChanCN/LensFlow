import { type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { MaterialScope } from '@/components/material/MaterialScope'
import { ThemeToggle } from '@/components/material/ThemeToggle'

interface LayoutProps {
  children: ReactNode
  title?: string
  appearance?: 'default' | 'material'
}

export function Layout({ children, title = 'LensFlow', appearance = 'material' }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isClient = user?.role === 'client'

  const handleLogout = () => {
    useAuthStore.getState().logout()
    navigate('/login')
  }

  const navItems = isClient
    ? [
        { to: '/client', label: '我的' },
        { to: '/booking', label: '预约' },
      ]
    : [
        { to: '/dashboard', label: '工作台' },
        { to: '/orders', label: '订单' },
      ]

  const content = (
    <div className={`flex min-h-screen flex-col bg-system-bg-grouped ${appearance === 'material' ? 'material-layout' : ''}`}>
      <nav className="sticky top-0 z-20 border-b border-separator bg-system-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
          <Link
            to={isClient ? '/client' : '/dashboard'}
            className="text-base font-semibold tracking-tight text-label"
          >
            {appearance === 'material' && <span className="material-logo-symbol" aria-hidden="true">◉</span>}{title}
            {appearance === 'material' && <span className="material-nav-caption" aria-hidden="true">/ &nbsp; CREATIVE WORKSPACE</span>}
          </Link>
          <div className="flex items-center gap-1">
            {appearance === 'material' && <ThemeToggle />}
            {navItems.map((item) => {
              const active = location.pathname === item.to || (item.to === '/orders' && location.pathname.startsWith('/orders/'))
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-body-sm font-medium transition-colors duration-[var(--duration-fast)] active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong ${
                    active
                      ? 'bg-action-primary-strong text-white'
                      : 'text-label-muted hover:bg-system-fill hover:text-label'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            <button
              onClick={handleLogout}
              type="button"
              className="ml-1 rounded-full px-3.5 py-1.5 text-body-sm font-medium text-label-muted transition-colors duration-[var(--duration-fast)] hover:text-label active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong"
            >
              退出
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 py-2">
        {children}
        {appearance === 'material' && <footer className="material-workspace-footer"><span>LensFlow / Creative workspace</span><span>专注影像，让创作流动。</span></footer>}
      </main>
    </div>
  )
  return appearance === 'material' ? <MaterialScope>{content}</MaterialScope> : content
}
