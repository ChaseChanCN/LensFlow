import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login, extractErrorMessage } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { Button, Input } from '@/components/ui'

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
      navigate(data.user.role === 'client' ? '/client' : '/')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-system-bg-grouped px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-4xl font-bold tracking-tight text-label">LensFlow</h1>
        <p className="mb-8 text-center text-sm text-label-secondary">登录你的账号</p>

        {error && (
          <div className="mb-4 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="overflow-hidden rounded-card bg-system-bg shadow-card">
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱"
                required
                className="border-0 p-0 focus:ring-0"
              />
            </div>
            <div className="p-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                required
                className="border-0 p-0 focus:ring-0"
              />
            </div>
          </div>
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-label-tertiary">
          没有账号？
          <Link to="/register" className="ml-1 font-medium text-accent hover:text-accent-hover">
            注册
          </Link>
        </p>
      </div>
    </div>
  )
}
