import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { listBookings, confirmBooking } from '@/api/bookings'
import { listOrders } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, StatusBadge, EmptyState, Spinner } from '@/components/ui'
import { QuickActions } from '@/components/effects/QuickActions'
import { BeamSurface, MetalSurface } from '@/components/effects/EffectSurfaces'

export function DashboardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [error, setError] = useState('')
  const pendingRef = useRef<HTMLDivElement>(null)
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: listBookings,
  })
  const { data: orders, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })

  const confirmMutation = useMutation({
    mutationFn: (id: number) => {
      if (!user) throw new Error('登录已过期，请重新登录')
      return confirmBooking(id, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const pendingBookings = bookings?.filter((b) => b.status === 'pending') || []
  const activeOrders = orders?.filter(
    (o) => o.status !== 'ARCHIVED' && o.status !== 'CANCELLED',
  ) || []

  return (
    <Layout title="LensFlow" appearance="material">
      <div className="material-page-heading"><p className="material-eyeline">YOUR CREATIVE SPACE</p><LargeTitle title="工作台" subtitle="整理每一次拍摄，让创作保持流动。" /><span className="material-page-index" aria-hidden="true">WORKSPACE / 01</span></div>

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      <div className="material-stat-grid" aria-label="概览">
        <BeamSurface><button type="button" className="material-stat-card" onClick={() => pendingRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}><span className="material-stat-label">待确认预约 <span aria-hidden="true">↗</span></span><strong>{bookingsLoading || bookingsError ? '—' : pendingBookings.length}</strong><span className="material-overline" aria-hidden="true">UP NEXT / BOOKINGS</span></button></BeamSurface>
        <button type="button" className="material-stat-card" onClick={() => navigate('/orders')}><span className="material-stat-label">进行中订单 <span aria-hidden="true">↗</span></span><strong>{ordersLoading || ordersError ? '—' : activeOrders.length}</strong><span className="material-overline" aria-hidden="true">IN PROGRESS / ORDERS</span></button>
        <button type="button" className="material-stat-card" onClick={() => navigate('/orders')}><span className="material-stat-label">总订单数 <span aria-hidden="true">↗</span></span><strong>{ordersLoading || ordersError ? '—' : orders?.length || 0}</strong><span className="material-overline" aria-hidden="true">YOUR WORK / TOTAL</span></button>
      </div>

      <QuickActions />

      <div ref={pendingRef} className="material-booking-list scroll-mt-20">
        <ListGroup header="待确认预约">
          {bookingsLoading ? <div className="flex justify-center p-6"><Spinner label="正在加载预约" /></div> : bookingsError ? (
            <div role="alert"><EmptyState title="预约加载失败" action={{ label: '重试', onClick: () => { void refetchBookings() } }} /></div>
          ) : pendingBookings.length === 0 ? (
            <EmptyState title="暂无待确认预约" description="新的预约会显示在这里。" />
          ) : (
            pendingBookings.map((b, i) => (
              <ListItem
                key={b.id}
                leading={<StatusBadge status={b.status} />}
                title={<Link to={`/bookings/${b.id}`} className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">{`#${b.id} · ${b.shoot_type}`}</Link>}
                subtitle={new Date(b.created_at).toLocaleDateString()}
                trailing={
                  <MetalSurface><Button
                    className="material-primary-button material-confirm-button"
                    type="button"
                    size="sm"
                    aria-label={`确认预约 #${b.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setError('')
                      confirmMutation.mutate(b.id)
                    }}
                    disabled={confirmMutation.isPending}
                    loading={confirmMutation.isPending && confirmMutation.variables === b.id}
                  >
                    确认
                  </Button></MetalSurface>
                }
                isLast={i === pendingBookings.length - 1}
              />
            ))
          )}
        </ListGroup>
      </div>

      {ordersError && <div role="alert" className="mx-4 mt-4 rounded-card bg-error-bg"><EmptyState title="订单概览加载失败" action={{ label: '重试', onClick: () => { void refetchOrders() } }} /></div>}

      <div className="px-4 pt-4">
        <Link to="/orders" className="rounded-control text-body-sm font-medium text-action-primary-strong hover:text-action-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">
          查看全部订单 →
        </Link>
      </div>
    </Layout>
  )
}
