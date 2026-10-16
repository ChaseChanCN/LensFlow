import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login, extractErrorMessage } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { Button, Input } from '@/components/ui'
import { MetalSurface } from '@/components/effects/EffectSurfaces'
import { MaterialScope } from '@/components/material/MaterialScope'
import { ThemeToggle } from '@/components/material/ThemeToggle'

export function LoginPage() {
  const navigate = useNavigate()
  const { setUser, setToken } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login({ email, password })
      setToken(data.access_token)
      setUser(data.user)
      navigate(data.user.role === 'client' ? '/client' : '/dashboard')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <MaterialScope><main className="material-login">
      <header className="material-login-top"><div className="material-login-wordmark"><span aria-hidden="true">◉</span> LensFlow <span className="material-login-edition">/ &nbsp; THE CREATIVE SPACE</span></div><div className="material-login-tools"><span className="material-overline">MEMBER ACCESS / 01</span><ThemeToggle /></div></header>
      <div className="material-login-body">
      <section className="material-login-story" aria-label="创作空间">
        <p className="material-eyeline">THE FEELING OF FLOW</p>
        <h2>让光，<br /><span>成为你的作品。</span></h2>
        <p className="material-story-description">从一次预约，到最后一张成片。<br />为你的灵感，留出专注的空间。</p>
        <div className="material-light-study" aria-hidden="true"><i /><i /><i /><i /><i /><i /><span>LIGHT / FORM / PERSPECTIVE</span></div>
        <p className="material-story-footnote">为摄影师与每一个热爱影像的人而设计。</p>
      </section>
      <section className="material-login-panel" aria-labelledby="login-heading">
        <span className="material-overline">WELCOME TO YOUR WORKSPACE</span>
        <h1 id="login-heading">欢迎回来</h1>
        <p className="material-login-description">登录你的账号，继续上一次的创作。</p>

        {error && (
          <div id="login-error" role="alert" className="mb-4 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="material-login-fields overflow-hidden rounded-card bg-system-bg shadow-card">
            <div className="border-b border-separator-opaque p-4">
              <label htmlFor="email" className="material-field-label">邮箱</label>
              <Input
                variant="grouped"
                name="email"
                aria-label="邮箱"
                autoComplete="username"
                aria-describedby={error ? 'login-error' : undefined}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="p-4">
              <label htmlFor="password" className="material-field-label">密码</label>
              <Input
                variant="grouped"
                name="password"
                aria-label="密码"
                autoComplete="current-password"
                aria-describedby={error ? 'login-error' : undefined}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入你的密码"
                required
              />
            </div>
          </div>
          <MetalSurface><Button type="submit" fullWidth size="lg" loading={loading} className="material-primary-button">
            登录
          </Button></MetalSurface>
        </form>

        <p className="mt-6 text-center text-body-sm text-label-muted">
          没有账号？
          <Link to="/register" className="ml-1 rounded-control font-medium text-action-primary-strong hover:text-action-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">
            注册
          </Link>
        </p>
        <div className="material-login-panel-note"><span aria-hidden="true">◈</span> 你的作品，从这里开始。</div>
      </section>
      </div>
      <footer className="material-login-footer"><span>LensFlow / Photography in flow</span><span>LESS DISTRACTION. MORE CREATION.</span></footer>
    </main></MaterialScope>
  )
}
