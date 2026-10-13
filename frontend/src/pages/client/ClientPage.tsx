import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { listOrders } from '@/api/orders'
import { listBookings, cancelBooking, type Booking } from '@/api/bookings'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, StatusBadge } from '@/components/ui'

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

export function ClientPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })
  const { data: bookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: listBookings,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const activeOrders = orders?.filter(
    (o) => o.status !== 'ARCHIVED' && o.status !== 'CANCELLED',
  ) || []

  const myBookings = bookings || []

  return (
    <Layout title="LensFlow">
      <LargeTitle title="我的" subtitle="预约摄影师、查看订单与交付" />

      {error && (
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <ListGroup header="快捷操作">
        <ListItem
          title="预约摄影师"
          subtitle="填写拍摄需求，提交预约"
          onClick={() => (window.location.href = '/booking')}
          showChevron
        />
        <ListItem
          title="进行中订单"
          trailing={<span className="text-lg font-bold text-label">{activeOrders.length}</span>}
          isLast
        />
      </ListGroup>

      <ListGroup header="我的预约">
        {myBookings.length === 0 ? (
          <ListItem title="暂无预约" subtitle="点击上方"预约摄影师"开始" isLast />
        ) : (
          myBookings.map((b: Booking, i) => (
            <ListItem
              key={b.id}
              leading={<StatusBadge status={b.status} />}
              title={`#${b.id} · ${b.shoot_type}`}
              subtitle={b.preferred_date ? new Date(b.preferred_date).toLocaleDateString() : undefined}
              trailing={
                b.status === 'pending' ? (
                  <Button
                    variant="plain"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setError('')
                      cancelMutation.mutate(b.id)
                    }}
                    disabled={cancelMutation.isPending}
                    className="!text-error hover:!text-error/80"
                  >
                    取消
                  </Button>
                ) : undefined
              }
              onClick={() => (window.location.href = `/bookings/${b.id}`)}
              showChevron
              isLast={i === myBookings.length - 1}
            />
          ))
        )}
      </ListGroup>

      <ListGroup header="我的订单">
        {activeOrders.length === 0 ? (
          <ListItem title="暂无订单" subtitle="预约被摄影师确认后将生成订单" isLast />
        ) : (
          activeOrders.map((o, i) => (
            <ListItem
              key={o.id}
              leading={<StatusBadge status={STATUS_MAP[o.status] || 'neutral'} />}
              title={`订单 #${o.id}`}
              subtitle={STATUS_LABELS[o.status] || o.status}
              trailing={
                <div className="flex gap-3">
                  <Link to={`/orders/${o.id}/selection`} className="text-accent hover:text-accent-hover">选片</Link>
                  <Link to={`/orders/${o.id}/delivery`} className="text-accent hover:text-accent-hover">交付</Link>
                </div>
              }
              isLast={i === activeOrders.length - 1}
            />
          ))
        )}
      </ListGroup>
    </Layout>
  )
}
