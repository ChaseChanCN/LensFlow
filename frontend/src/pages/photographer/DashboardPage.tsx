import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { listBookings } from '@/api/bookings'
import { listOrders } from '@/api/orders'

export function DashboardPage() {
  const { data: bookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: listBookings,
  })
  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })

  const pendingBookings = bookings?.filter((b) => b.status === 'pending') || []
  const activeOrders = orders?.filter(
    (o) => o.status !== 'ARCHIVED' && o.status !== 'CANCELLED',
  ) || []

  return (
    <Layout title="LensFlow">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">工作台</h2>
          <p className="mt-1 text-sm text-gray-400">预约与订单概览</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">待确认预约</p>
            <p className="mt-2 text-2xl font-semibold">{pendingBookings.length}</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">进行中订单</p>
            <p className="mt-2 text-2xl font-semibold">{activeOrders.length}</p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">总订单数</p>
            <p className="mt-2 text-2xl font-semibold">{orders?.length || 0}</p>
          </div>
        </div>

        {pendingBookings.length > 0 && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">待确认预约</h3>
            <div className="space-y-2">
              {pendingBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span>#{b.id} {b.shoot_type}</span>
                  <span className="text-gray-400">
                    {new Date(b.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <Link
            to="/orders"
            className="text-sm text-gray-600 underline"
          >
            查看全部订单
          </Link>
        </div>
      </div>
    </Layout>
  )
}
