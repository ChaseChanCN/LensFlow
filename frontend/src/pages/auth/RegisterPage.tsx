import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register, extractErrorMessage } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { Button, Input, Select } from '@/components/ui'

export function RegisterPage() {
  const navigate = useNavigate()
  const { setUser, setToken } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'photographer' | 'client'>('client')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await register({ email, password, name, role })
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
        <h1 className="mb-2 text-center text-4xl font-bold tracking-tight text-label">创建账号</h1>
        <p className="mb-8 text-center text-sm text-label-secondary">加入 LensFlow</p>

        {error && (
          <div className="mb-4 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="overflow-hidden rounded-card bg-system-bg shadow-card">
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="姓名"
                required
                className="border-0 p-0 focus:ring-0"
              />
            </div>
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
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                required
                className="border-0 p-0 focus:ring-0"
              />
            </div>
            <div className="p-4">
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as 'photographer' | 'client')}
                className="border-0 p-0 focus:ring-0"
              >
                <option value="client">客户</option>
                <option value="photographer">摄影师</option>
              </Select>
            </div>
          </div>
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-label-tertiary">
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-accent hover:text-accent-hover">
            登录
          </Link>
        </p>
      </div>
    </div>
  )
}
