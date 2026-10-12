import { Layout } from '@/components/Layout'

export function DashboardPage() {
  return (
    <Layout title="LensFlow">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">工作台</h2>
          <p className="mt-1 text-sm text-gray-400">摄影师工作台 - 待开发</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">待确认预约</p>
            <p className="mt-2 text-2xl font-semibold">0</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">进行中订单</p>
            <p className="mt-2 text-2xl font-semibold">0</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">待办事项</p>
            <p className="mt-2 text-2xl font-semibold">0</p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
