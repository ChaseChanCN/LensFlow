import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getOrder, getOrderTimeline, updateOrderStatus, type OrderTimeline } from '@/api/orders'
import { Layout } from '@/components/Layout'
import type { OrderStatus } from '@/types'
import { extractErrorMessage } from '@/api/auth'
import { useState } from 'react'

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
    return <Layout><p className="text-sm text-gray-400">加载中...</p></Layout>
  }

  if (!order) {
    return <Layout><p className="text-sm text-gray-400">订单不存在</p></Layout>
  }

  const actions = NEXT_ACTIONS[order.status] || []

  return (
    <Layout title="LensFlow">
      <div className="space-y-6">
        <div>
          <button
            onClick={() => navigate('/orders')}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            返回列表
          </button>
          <h2 className="mt-2 text-lg font-medium">订单 #{order.id}</h2>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium">订单信息</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-400">状态</dt>
            <dd>{STATUS_LABELS[order.status] || order.status}</dd>
            <dt className="text-gray-400">预约编号</dt>
            <dd>#{order.booking_id}</dd>
            <dt className="text-gray-400">创建时间</dt>
            <dd>{new Date(order.created_at).toLocaleString()}</dd>
          </dl>
        </div>

        {actions.length > 0 && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">操作</h3>
            <div className="flex gap-3">
              {actions.map((act) => (
                <button
                  key={act.action}
                  onClick={() => {
                    setError('')
                    statusMutation.mutate({ status: act.status, action: act.action })
                  }}
                  disabled={statusMutation.isPending}
                  className="rounded bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(order.status === 'WAITING_UPLOAD' || order.status === 'ANALYZING' || order.status === 'WAITING_REVIEW') && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">照片管理</h3>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/orders/${order.id}/upload`)}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
              >
                上传照片
              </button>
              <button
                onClick={() => navigate(`/orders/${order.id}/analysis`)}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
              >
                查看分析结果
              </button>
            </div>
          </div>
        )}

        {(order.status === 'WAITING_SELECTION' || order.status === 'WAITING_RETOUCH' || order.status === 'RETOUCHING' || order.status === 'WAITING_CLIENT_CONFIRM') && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">选片与修图</h3>
            <div className="flex gap-3">
              {order.status === 'WAITING_SELECTION' && (
                <button
                  onClick={() => navigate(`/orders/${order.id}/selection`)}
                  className="rounded border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
                >
                  选片
                </button>
              )}
              <button
                onClick={() => navigate(`/orders/${order.id}/retouch`)}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
              >
                修图协作
              </button>
            </div>
          </div>
        )}

        {(order.status === 'WAITING_DELIVERY' || order.status === 'DELIVERED' || order.status === 'ARCHIVED') && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">交付</h3>
            <button
              onClick={() => navigate(`/orders/${order.id}/delivery`)}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
            >
              交付管理
            </button>
          </div>
        )}

        {timeline && timeline.length > 0 && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">操作记录</h3>
            <div className="space-y-2">
              {timeline.map((t: OrderTimeline) => (
                <div key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                  <span className="text-gray-600">{t.action}</span>
                  <span className="text-gray-400">
                    {t.from_status && `${STATUS_LABELS[t.from_status] || t.from_status} -> `}
                    {STATUS_LABELS[t.to_status] || t.to_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
