import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register, extractErrorMessage } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { Button, Input, Select } from '@/components/ui'
import { PublicShell } from '@/components/material/PublicShell'

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
      navigate(data.user.role === 'client' ? '/client' : '/dashboard')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell><main className="material-register-layout">
      <section className="material-register-story"><p className="material-eyeline">YOUR NEXT CREATION</p><h2>从一次相遇，<br /><span>到一组好作品。</span></h2><p>让预约、拍摄、选片与交付连成一条清晰的创作路径。<br />选择你的角色，开启属于你的影像空间。</p><div className="material-light-study" aria-hidden="true"><i/><i/><i/><i/><i/></div></section>
      <section className="material-login-panel" aria-labelledby="register-heading">
        <h1 id="register-heading" className="mb-2 text-heading-xl font-bold tracking-tight text-label">创建账号</h1>
        <p className="mb-8 text-center text-body-sm text-label-muted">加入 LensFlow</p>

        {error && (
          <div role="alert" id="register-error" className="mb-4 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="overflow-hidden rounded-card bg-system-bg shadow-card">
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="text"
                name="name" label="姓名" aria-label="姓名" autoComplete="name" aria-describedby={error ? 'register-error' : undefined}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="姓名"
                required
                variant="grouped"
              />
            </div>
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="email"
                name="email" label="邮箱" aria-label="邮箱" autoComplete="email" aria-describedby={error ? 'register-error' : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱"
                required
                variant="grouped"
              />
            </div>
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="password"
                name="new-password" label="密码" aria-label="密码" autoComplete="new-password" aria-describedby={error ? 'register-error' : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                required
                variant="grouped"
              />
            </div>
            <div className="p-4">
              <Select
                name="role"
                label="账号类型" aria-label="账号类型"
                value={role}
                onChange={(e) => setRole(e.target.value as 'photographer' | 'client')}
                variant="grouped"
              >
                <option value="client">客户</option>
                <option value="photographer">摄影师</option>
              </Select>
            </div>
          </div>
          <Button effect="beam" type="submit" fullWidth size="lg" loading={loading}>
            注册
          </Button>
        </form>

        <p className="mt-6 text-center text-body-sm text-label-muted">
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-action-primary-strong hover:text-action-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">
            登录
          </Link>
        </p>
      </section>
    </main></PublicShell>
  )
}
