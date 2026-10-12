import { type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
  title?: string
}

export function Layout({ children, title = 'LensFlow' }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    navigate('/login')
  }

  const isActive = (path: string) =>
    location.pathname === path ? 'font-semibold text-black' : 'text-gray-500'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            {title}
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link to="/" className={isActive('/')}>
              工作台
            </Link>
            <Link to="/orders" className={isActive('/orders')}>
              订单
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-400 transition hover:text-gray-600"
            >
              退出
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
