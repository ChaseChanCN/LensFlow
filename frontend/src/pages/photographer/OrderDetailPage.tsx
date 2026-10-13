import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getOrder, getOrderTimeline, updateOrderStatus, type OrderTimeline } from '@/api/orders'
import { Layout } from '@/components/Layout'
import type { OrderStatus } from '@/types'
import { extractErrorMessage } from '@/api/auth'
import { useState } from 'react'
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

const NEXT_ACTIONS: Record<string, { status: OrderStatus; label: string; action: string }[]> = {
  CONFIRMED: [{ status: 'WAITING_SHOOT', label: '开始拍摄', action: 'start_shoot' }],
  WAITING_SHOOT: [{ status: 'WAITING_UPLOAD', label: '完成拍摄', action: 'shoot_done' }],
  WAITING_REVIEW: [{ status: 'WAITING_SELECTION', label: '发布选片集', action: 'publish_selection' }],
  WAITING_RETOUCH: [{ status: 'RETOUCHING', label: '开始修图', action: 'start_retouch' }],
  RETOUCHING: [{ status: 'WAITING_CLIENT_CONFIRM', label: '上传预览', action: 'upload_preview' }],
  WAITING_DELIVERY: [{ status: 'DELIVERED', label: '上传最终成片', action: 'upload_delivery' }],
  DELIVERED: [{ status: 'ARCHIVED', label: '归档', action: 'archive' }],
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(Number(id)),
    enabled: !!id,
  })

  const { data: timeline } = useQuery({
    queryKey: ['order-timeline', id],
    queryFn: () => getOrderTimeline(Number(id)),
    enabled: !!id,
  })

  const statusMutation = useMutation({
    mutationFn: (params: { status: OrderStatus; action: string }) =>
      updateOrderStatus(Number(id), params.status, params.action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['order-timeline', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (isLoading) {
    return <Layout><p className="px-4 text-sm text-label-tertiary">加载中...</p></Layout>
  }

  if (!order) {
    return <Layout><p className="px-4 text-sm text-label-tertiary">订单不存在</p></Layout>
  }

  const actions = NEXT_ACTIONS[order.status] || []

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title={`订单 #${order.id}`}
        action={
          <button onClick={() => navigate('/orders')} className="text-sm font-medium text-accent hover:text-accent-hover">
            ← 返回
          </button>
        }
      />

      {error && (
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <ListGroup header="订单信息">
        <ListItem title="状态" trailing={<StatusBadge status={STATUS_MAP[order.status] || 'neutral'} />} />
        <ListItem title="预约编号" trailing={`#${order.booking_id}`} />
        <ListItem title="创建时间" trailing={new Date(order.created_at).toLocaleString()} isLast />
      </ListGroup>

      {actions.length > 0 && (
        <ListGroup header="操作">
          {actions.map((act, i) => (
            <ListItem
              key={act.action}
              title={act.label}
              onClick={() => {
                setError('')
                statusMutation.mutate({ status: act.status, action: act.action })
              }}
              isLast={i === actions.length - 1}
            />
          ))}
        </ListGroup>
      )}

      {(order.status === 'WAITING_UPLOAD' || order.status === 'ANALYZING' || order.status === 'WAITING_REVIEW') && (
        <ListGroup header="照片管理">
          <ListItem title="上传照片" onClick={() => navigate(`/orders/${order.id}/upload`)} showChevron />
          <ListItem title="查看分析结果" onClick={() => navigate(`/orders/${order.id}/analysis`)} showChevron isLast />
        </ListGroup>
      )}

      {(order.status === 'WAITING_SELECTION' || order.status === 'WAITING_RETOUCH' || order.status === 'RETOUCHING' || order.status === 'WAITING_CLIENT_CONFIRM') && (
        <ListGroup header="选片与修图">
          {order.status === 'WAITING_SELECTION' && (
            <ListItem title="选片" onClick={() => navigate(`/orders/${order.id}/selection`)} showChevron />
          )}
          <ListItem title="修图协作" onClick={() => navigate(`/orders/${order.id}/retouch`)} showChevron isLast />
        </ListGroup>
      )}

      {(order.status === 'WAITING_DELIVERY' || order.status === 'DELIVERED' || order.status === 'ARCHIVED') && (
        <ListGroup header="交付">
          <ListItem title="交付管理" onClick={() => navigate(`/orders/${order.id}/delivery`)} showChevron isLast />
        </ListGroup>
      )}

      {timeline && timeline.length > 0 && (
        <ListGroup header="操作记录">
          {timeline.map((t: OrderTimeline, i) => (
            <ListItem
              key={t.id}
              title={t.action}
              subtitle={`${t.from_status ? STATUS_LABELS[t.from_status] + ' → ' : ''}${STATUS_LABELS[t.to_status] || t.to_status}`}
              trailing={new Date(t.created_at).toLocaleString()}
              isLast={i === timeline.length - 1}
            />
          ))}
        </ListGroup>
      )}
    </Layout>
  )
}
