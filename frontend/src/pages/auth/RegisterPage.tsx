import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { UserRole } from '@/types'

export function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('client')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">LensFlow 注册</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600">姓名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
            >
              <option value="client">客户</option>
              <option value="photographer">摄影师</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full rounded bg-black py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            注册
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-400">
          已有账号？
          <Link to="/login" className="text-gray-600 underline">
            登录
          </Link>
        </p>
      </div>
    </div>
  )
}
