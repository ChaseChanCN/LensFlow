import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MaterialScope } from './MaterialScope'
import { ThemeToggle } from './ThemeToggle'

export function PublicShell({children}: {children: ReactNode}) {
  return <MaterialScope><div className="material-public-shell">
    <header className="material-public-header">
      <Link to="/" className="material-public-brand"><span aria-hidden="true">◉</span> LensFlow <small>THE FEELING OF FLOW</small></Link>
      <nav aria-label="公共导航"><ThemeToggle /><Link to="/login" aria-label="前往登录">登录</Link><Link to="/register" aria-label="前往注册">注册</Link></nav>
    </header>
    {children}
    <footer className="material-workspace-footer"><span>LensFlow / Creative workspace</span><span>专注影像，让创作流动。</span></footer>
  </div></MaterialScope>
}
