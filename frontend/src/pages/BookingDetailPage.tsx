import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { getBooking, updateBooking, cancelBooking, confirmBooking } from '@/api/bookings'
import { useAuthStore } from '@/stores/auth'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, Input, Select, Textarea, StatusBadge, EmptyState, LoadingState, ErrorState, Spinner } from '@/components/ui'

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const bookingId = Number(id)

  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    shoot_type: '',
    preferred_date: '',
    contact_info: '',
    location: '',
    duration_hours: '',
    note: '',
  })

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBooking(bookingId),
    enabled: !!id,
  })

  const isClient = user?.role === 'client'
  const isPhotographer = user?.role === 'photographer'
  const canEdit = booking?.status === 'pending'

  const startEdit = () => {
    if (!booking) return
    setForm({
      shoot_type: booking.shoot_type,
      preferred_date: booking.preferred_date || '',
      contact_info: booking.contact_info,
      location: booking.location || '',
      duration_hours: booking.duration_hours?.toString() || '',
      note: booking.note || '',
    })
    setEditing(true)
    setError('')
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBooking(bookingId, {
        shoot_type: form.shoot_type,
        preferred_date: form.preferred_date || null,
        contact_info: form.contact_info,
        location: form.location || null,
        duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
        note: form.note || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setEditing(false)
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('登录已过期，请重新登录')
      return confirmBooking(bookingId, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title={`预约 #${bookingId}`}
        action={
          <Button type="button" variant="plain" onClick={() => navigate(-1)}>← 返回</Button>
        }
      />

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      {isLoading && <LoadingState label="正在加载预约" />}
      {isError && <ErrorState title="预约加载失败" onRetry={() => { void refetch() }} />}
      {!isLoading && !isError && !booking && <EmptyState title="预约不存在" />}

      {booking && !editing && (
        <>
          <ListGroup header="预约信息">
            <ListItem title="状态" trailing={<StatusBadge status={booking.status} />} />
            <ListItem title="拍摄类型" trailing={booking.shoot_type} />
            <ListItem title="期望日期" trailing={booking.preferred_date || '未指定'} />
            <ListItem title="拍摄地点" trailing={booking.location || '未指定'} />
            <ListItem title="拍摄时长" trailing={booking.duration_hours ? `${booking.duration_hours} 小时` : '未指定'} />
            <ListItem title="联系方式" trailing={booking.contact_info} isLast />
          </ListGroup>

          {booking.note && (
            <ListGroup header="备注">
              <ListItem title={booking.note} isLast />
            </ListGroup>
          )}

          {canEdit && (
            <ListGroup header="操作">
              <ListItem title="修改详情" onClick={startEdit} disabled={cancelMutation.isPending || confirmMutation.isPending} showChevron />
              {isClient && (
                <ListItem
                  title="取消预约"
                  destructive
                  disabled={cancelMutation.isPending}
                  aria-busy={cancelMutation.isPending}
                  trailing={cancelMutation.isPending ? <Spinner decorative size="sm" /> : undefined}
                  onClick={() => { setError(''); cancelMutation.mutate() }}
                />
              )}
              {isPhotographer && (
                <ListItem
                  title="确认预约"
                  disabled={confirmMutation.isPending}
                  aria-busy={confirmMutation.isPending}
                  trailing={confirmMutation.isPending ? <Spinner decorative size="sm" /> : undefined}
                  onClick={() => { setError(''); confirmMutation.mutate() }}
                  isLast
                />
              )}
            </ListGroup>
          )}
        </>
      )}

      {booking && editing && (
        <form onSubmit={(event) => { event.preventDefault(); setError(''); if (!updateMutation.isPending) updateMutation.mutate() }}>
          <div className="px-4">
            <div className="overflow-hidden rounded-card bg-system-bg shadow-card">
              <div className="border-b border-separator-opaque p-4">
                <Select
                  aria-label="拍摄类型" name="shoot_type"
                  value={form.shoot_type}
                  onChange={(e) => setForm({ ...form, shoot_type: e.target.value })}
                  variant="grouped"
                >
                  <option value="wedding">婚纱摄影</option>
                  <option value="portrait">人像写真</option>
                  <option value="family">家庭合影</option>
                  <option value="product">产品摄影</option>
                  <option value="event">活动记录</option>
                </Select>
              </div>
              <div className="border-b border-separator-opaque p-4">
                <Input
                  type="date" label="期望日期"
                  aria-label="期望日期" name="preferred_date"
                  value={form.preferred_date}
                  onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                  variant="grouped"
                />
              </div>
              <div className="border-b border-separator-opaque p-4">
                <Input
                  type="text"
                  aria-label="拍摄地点" name="location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="拍摄地点"
                  variant="grouped"
                />
              </div>
              <div className="border-b border-separator-opaque p-4">
                <Input
                  type="number"
                  step="0.5"
                  min="0.5"
                  aria-label="拍摄时长（小时）" name="duration_hours"
                  value={form.duration_hours}
                  onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
                  placeholder="拍摄时长（小时）"
                  variant="grouped"
                />
              </div>
              <div className="p-4">
                <Input
                  type="text"
                  aria-label="联系方式" name="contact_info"
                  value={form.contact_info}
                  onChange={(e) => setForm({ ...form, contact_info: e.target.value })}
                  placeholder="联系方式"
                  required
                  variant="grouped"
                />
              </div>
            </div>
          </div>

          <div className="px-4 pt-4">
            <Textarea
              aria-label="备注" name="note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="备注"
              rows={3}
            />
          </div>

          <div className="flex gap-3 px-4 pt-4">
            <Button type="submit" loading={updateMutation.isPending}>
              保存修改
            </Button>
            <Button type="button" variant="gray" disabled={updateMutation.isPending} onClick={() => setEditing(false)}>
              取消编辑
            </Button>
          </div>
        </form>
      )}
    </Layout>
  )
}
