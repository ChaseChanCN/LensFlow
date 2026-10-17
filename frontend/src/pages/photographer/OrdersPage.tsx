import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listOrders, type Order } from '@/api/orders'
import { Layout } from '@/components/Layout'
import { LargeTitle, ListGroup, ListItem, StatusBadge, EmptyState, Spinner } from '@/components/ui'

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
  const navigate = useNavigate()
  const { data: orders, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })

  return (
    <Layout title="LensFlow">
      <LargeTitle title="订单" subtitle="所有摄影订单" />

      {isLoading && <div className="flex justify-center p-6"><Spinner label="正在加载订单" /></div>}

      {isError && <div role="alert" className="mx-4 rounded-card bg-error-bg"><EmptyState title="订单加载失败" description="请稍后重试。" action={{ label: '重试', onClick: () => { void refetch() } }} /></div>}

      {orders && orders.length === 0 && (
        <ListGroup>
          <EmptyState title="暂无订单" description="预约确认后，摄影订单会显示在这里。" />
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
              onClick={() => navigate(`/orders/${order.id}`)}
              showChevron
              isLast={i === orders.length - 1}
            />
          ))}
        </ListGroup>
      )}
    </Layout>
  )
}
