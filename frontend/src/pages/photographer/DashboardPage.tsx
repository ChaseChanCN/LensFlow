import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { listBookings, confirmBooking } from '@/api/bookings'
import { listOrders } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, StatusBadge } from '@/components/ui'

export function DashboardPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [error, setError] = useState('')
  const pendingRef = useRef<HTMLDivElement>(null)
  const { data: bookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: listBookings,
  })
  const { data: orders } = useQuery({
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
    <Layout title="LensFlow">
      <LargeTitle title="工作台" subtitle="预约与订单概览" />

      {error && (
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <ListGroup header="概览">
        <ListItem
          title="待确认预约"
          trailing={<span className="text-2xl font-bold text-label">{pendingBookings.length}</span>}
          onClick={() => pendingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          showChevron
        />
        <ListItem
          title="进行中订单"
          trailing={<span className="text-2xl font-bold text-label">{activeOrders.length}</span>}
          onClick={() => (window.location.href = '/orders')}
          showChevron
        />
        <ListItem
          title="总订单数"
          trailing={<span className="text-2xl font-bold text-label">{orders?.length || 0}</span>}
          onClick={() => (window.location.href = '/orders')}
          showChevron
          isLast
        />
      </ListGroup>

      <div ref={pendingRef} className="scroll-mt-20">
        <ListGroup header="待确认预约">
          {pendingBookings.length === 0 ? (
            <ListItem title="暂无待确认预约" isLast />
          ) : (
            pendingBookings.map((b, i) => (
              <ListItem
                key={b.id}
                leading={<StatusBadge status={b.status} />}
                title={`#${b.id} · ${b.shoot_type}`}
                subtitle={new Date(b.created_at).toLocaleDateString()}
                trailing={
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setError('')
                      confirmMutation.mutate(b.id)
                    }}
                    disabled={confirmMutation.isPending}
                  >
                    确认
                  </Button>
                }
                onClick={() => (window.location.href = `/bookings/${b.id}`)}
                isLast={i === pendingBookings.length - 1}
              />
            ))
          )}
        </ListGroup>
      </div>

      <div className="px-4 pt-4">
        <Link to="/orders" className="text-sm font-medium text-accent hover:text-accent-hover">
          查看全部订单 →
        </Link>
      </div>
    </Layout>
  )
}
