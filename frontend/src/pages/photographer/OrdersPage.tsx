import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listOrders, type Order } from '@/api/orders'
import { Layout } from '@/components/Layout'
import { LargeTitle, ListGroup, ListItem, StatusBadge } from '@/components/ui'

const STATUS_MAP: Record<string, string> = {
  PENDING_CONFIRM: 'pending', CONFIRMED: 'confirmed', WAITING_SHOOT: 'confirmed',
  WAITING_UPLOAD: 'confirmed', ANALYZING: 'analyzing', WAITING_REVIEW: 'analyzing',
  WAITING_SELECTION: 'confirmed', WAITING_RETOUCH: 'retouching', RETOUCHING: 'retouching',
  WAITING_CLIENT_CONFIRM: 'retouching', WAITING_DELIVERY: 'confirmed',
  DELIVERED: 'delivered', ARCHIVED: 'completed', CANCELLED: 'cancelled',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_CONFIRM: '待确认', CONFIRMED: '已确认', WAITING_SHOOT: '待拍摄',
  WAITING_UPLOAD: '待上传', ANALYZING: '分析中', WAITING_REVIEW: '待复核',
  WAITING_SELECTION: '待选片', WAITING_RETOUCH: '待修图', RETOUCHING: '修图中',
  WAITING_CLIENT_CONFIRM: '待客户确认', WAITING_DELIVERY: '待交付',
  DELIVERED: '已交付', ARCHIVED: '已归档', CANCELLED: '已取消',
}

export function OrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })

  return (
    <Layout title="LensFlow">
      <LargeTitle title="订单" subtitle="所有摄影订单" />

      {isLoading && <p className="px-4 text-sm text-label-tertiary">加载中...</p>}

      {orders && orders.length === 0 && (
        <ListGroup>
          <ListItem title="暂无订单" isLast />
        </ListGroup>
      )}

      {orders && orders.length > 0 && (
        <ListGroup>
          {orders.map((order: Order, i) => (
            <ListItem
              key={order.id}
              title={`订单 #${order.id}`}
              subtitle={STATUS_LABELS[order.status] || order.status}
              leading={<StatusBadge status={STATUS_MAP[order.status] || 'neutral'} />}
              trailing={new Date(order.created_at).toLocaleDateString()}
              onClick={() => (window.location.href = `/orders/${order.id}`)}
              showChevron
              isLast={i === orders.length - 1}
            />
          ))}
        </ListGroup>
      )}
    </Layout>
  )
}
