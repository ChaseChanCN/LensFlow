import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <p className="text-4xl font-semibold text-gray-300">404</p>
      <p className="mt-2 text-sm text-gray-400">页面不存在</p>
      <Link
        to="/"
        className="mt-4 text-sm text-gray-600 underline"
      >
        返回首页
      </Link>
    </div>
  )
}
