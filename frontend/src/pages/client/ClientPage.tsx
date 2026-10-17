import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { listOrders } from '@/api/orders'
import { listBookings, cancelBooking, type Booking } from '@/api/bookings'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, StatusBadge, EmptyState, LoadingState, ErrorState } from '@/components/ui'
import { QuickActions } from '@/components/effects/QuickActions'

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
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { data: orders, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } = useQuery({
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
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      <QuickActions items={[{label:'预约摄影师',path:'/booking',icon:'booking'},{label:'查看我的订单',path:'#my-orders',icon:'orders'}]} description="从拍摄需求，到你的下一组作品" />
      <ListGroup header="概览">
        <ListItem
          title="进行中订单"
          trailing={<span className="text-body-lg font-bold text-label">{ordersLoading || ordersError ? '—' : activeOrders.length}</span>}
          isLast
        />
      </ListGroup>

      <ListGroup header="我的预约">
        {bookingsLoading ? <LoadingState label="正在加载我的预约" /> : bookingsError ? <ErrorState title="预约加载失败" onRetry={() => { void refetchBookings() }} /> : myBookings.length === 0 ? (
          <EmptyState title="暂无预约" description="提交拍摄需求，开始预约摄影师。" action={{ label: '预约摄影师', onClick: () => navigate('/booking') }} />
        ) : (
          myBookings.map((b: Booking, i) => (
            <ListItem
              key={b.id}
              leading={<StatusBadge status={b.status} />}
              title={<Link to={`/bookings/${b.id}`} className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">{`#${b.id} · ${b.shoot_type}`}</Link>}
              subtitle={b.preferred_date ? new Date(b.preferred_date).toLocaleDateString() : undefined}
              trailing={
                b.status === 'pending' ? (
                  <Button
                    type="button"
                    variant="destructive"
                    aria-label={`取消预约 #${b.id}`}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setError('')
                      cancelMutation.mutate(b.id)
                    }}
                    disabled={cancelMutation.isPending}
                    loading={cancelMutation.isPending && cancelMutation.variables === b.id}
                  >
                    取消
                  </Button>
                ) : undefined
              }
              isLast={i === myBookings.length - 1}
            />
          ))
        )}
      </ListGroup>

      <ListGroup header="我的订单" id="my-orders">
        {ordersLoading ? <LoadingState label="正在加载我的订单" /> : ordersError ? <ErrorState title="订单加载失败" onRetry={() => { void refetchOrders() }} /> : activeOrders.length === 0 ? (
          <EmptyState title="暂无订单" description="预约被摄影师确认后将生成订单。" />
        ) : (
          activeOrders.map((o, i) => (
            <ListItem
              key={o.id}
              leading={<StatusBadge status={STATUS_MAP[o.status] || 'neutral'} />}
              title={`订单 #${o.id}`}
              subtitle={STATUS_LABELS[o.status] || o.status}
              trailing={
                <div className="flex gap-3">
                  <Link to={`/orders/${o.id}/selection`} className="text-action-primary-strong hover:text-action-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">选片</Link>
                  <Link to={`/orders/${o.id}/delivery`} className="text-action-primary-strong hover:text-action-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">交付</Link>
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
