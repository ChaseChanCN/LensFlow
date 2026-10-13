import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getDelivery,
  uploadDelivery,
  archiveOrder,
  getDownloadUrl,
} from '@/api/deliveries'
import { getOrder } from '@/api/orders'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { LargeTitle, ListGroup, ListItem, Button, StatusBadge } from '@/components/ui'

const STATUS_MAP: Record<string, string> = {
  PENDING_CONFIRM: 'pending', CONFIRMED: 'confirmed', WAITING_SHOOT: 'confirmed',
  WAITING_UPLOAD: 'confirmed', ANALYZING: 'analyzing', WAITING_REVIEW: 'analyzing',
  WAITING_SELECTION: 'confirmed', WAITING_RETOUCH: 'retouching', RETOUCHING: 'retouching',
  WAITING_CLIENT_CONFIRM: 'retouching', WAITING_DELIVERY: 'confirmed',
  DELIVERED: 'delivered', ARCHIVED: 'completed', CANCELLED: 'cancelled',
}

export function DeliveryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  const isPhotographer = user?.role === 'photographer'

  const orderId = Number(id)

  const { data: order } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(orderId),
    enabled: !!id,
  })

  const { data: delivery, isLoading } = useQuery({
    queryKey: ['delivery', id],
    queryFn: () => getDelivery(orderId),
    enabled: !!id,
    retry: false,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDelivery(orderId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery', id] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const archiveMutation = useMutation({
    mutationFn: () => archiveOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title="交付"
        subtitle={`订单 #${orderId}`}
        action={
          <button onClick={() => navigate(-1)} className="text-sm font-medium text-accent hover:text-accent-hover">
            ← 返回
          </button>
        }
      />

      {error && (
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {isLoading && <p className="px-4 text-sm text-label-tertiary">加载中...</p>}

      {order && (
        <ListGroup header="订单状态">
          <ListItem title="当前状态" trailing={<StatusBadge status={STATUS_MAP[order.status] || 'neutral'} />} isLast />
        </ListGroup>
      )}

      {delivery && (
        <>
          <ListGroup header="成片信息">
            <ListItem title="文件名" trailing={delivery.filename} />
            <ListItem title="交付时间" trailing={new Date(delivery.delivered_at).toLocaleString()} isLast />
          </ListGroup>

          <div className="px-4 pt-4">
            <a href={getDownloadUrl(delivery.id)}>
              <Button>下载成片</Button>
            </a>
          </div>
        </>
      )}

      {isPhotographer && !delivery && order?.status === 'WAITING_DELIVERY' && (
        <ListGroup header="上传成片">
          <ListItem
            title="点击选择成片文件"
            subtitle="支持 JPEG/PNG/ZIP，最大 100MB"
            onClick={() => fileInputRef.current?.click()}
            showChevron
            isLast
          />
        </ListGroup>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg,image/png,.png,.zip"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            setError('')
            uploadMutation.mutate(file)
          }
        }}
        className="hidden"
      />

      {isPhotographer && delivery && order?.status === 'DELIVERED' && (
        <ListGroup header="归档">
          <ListItem
            title="归档订单"
            onClick={() => { setError(''); archiveMutation.mutate() }}
            isLast
          />
        </ListGroup>
      )}
    </Layout>
  )
}
