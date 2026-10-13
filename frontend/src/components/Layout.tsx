import { type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

interface LayoutProps {
  children: ReactNode
  title?: string
}

export function Layout({ children, title = 'LensFlow' }: LayoutProps) {
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
        { to: '/', label: '工作台' },
        { to: '/orders', label: '订单' },
      ]

  return (
    <div className="flex min-h-screen flex-col bg-system-bg-grouped">
      <nav className="sticky top-0 z-20 border-b border-separator bg-system-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
          <Link
            to={isClient ? '/client' : '/'}
            className="text-base font-semibold tracking-tight text-label"
          >
            {title}
          </Link>
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95 ${
                    active
                      ? 'bg-accent text-white'
                      : 'text-label-secondary hover:bg-system-fill hover:text-label'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            <button
              onClick={handleLogout}
              className="ml-1 rounded-full px-3.5 py-1.5 text-sm font-medium text-label-tertiary transition-all duration-200 hover:text-label-secondary active:scale-95"
            >
              退出
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 py-2">
        {children}
      </main>
    </div>
  )
}
