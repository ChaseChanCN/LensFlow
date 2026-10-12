import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">LensFlow 登录</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm text-gray-600">邮箱</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm text-gray-600">密码</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              placeholder="******"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-black py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            登录
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-400">
          没有账号？
          <Link to="/register" className="text-gray-600 underline">
            注册
          </Link>
        </p>
      </div>
    </div>
  )
}
