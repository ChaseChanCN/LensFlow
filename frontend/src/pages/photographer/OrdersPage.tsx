import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listOrders, type Order } from '@/api/orders'
import { Layout } from '@/components/Layout'

const STATUS_LABELS: Record<string, string> = {
  PENDING_CONFIRM: '待确认',
  CONFIRMED: '已确认',
  WAITING_SHOOT: '待拍摄',
  WAITING_UPLOAD: '待上传',
  ANALYZING: '分析中',
  WAITING_REVIEW: '待复核',
  WAITING_SELECTION: '待选片',
  WAITING_RETOUCH: '待修图',
  RETOUCHING: '修图中',
  WAITING_CLIENT_CONFIRM: '待客户确认',
  WAITING_DELIVERY: '待交付',
  DELIVERED: '已交付',
  ARCHIVED: '已归档',
  CANCELLED: '已取消',
}

export function OrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })

  return (
    <Layout title="LensFlow">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">订单列表</h2>
          <p className="mt-1 text-sm text-gray-400">所有摄影订单</p>
        </div>

        {isLoading && <p className="text-sm text-gray-400">加载中...</p>}

        {orders && orders.length === 0 && (
          <p className="text-sm text-gray-400">暂无订单</p>
        )}

        {orders && orders.length > 0 && (
          <div className="overflow-hidden rounded border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">编号</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: Order) => (
                  <tr key={order.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">#{order.id}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs">
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/orders/${order.id}`}
                        className="text-gray-600 underline"
                      >
                        查看
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
