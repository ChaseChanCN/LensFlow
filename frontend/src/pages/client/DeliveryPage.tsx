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
      <div className="space-y-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            返回
          </button>
          <h2 className="mt-2 text-lg font-medium">交付 - 订单 #{orderId}</h2>
          {order && (
            <p className="mt-1 text-sm text-gray-400">
              状态: {order.status}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {isLoading && (
          <p className="text-sm text-gray-400">加载中...</p>
        )}

        {delivery && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">成片信息</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-400">文件名</dt>
              <dd>{delivery.filename}</dd>
              <dt className="text-gray-400">交付时间</dt>
              <dd>{new Date(delivery.delivered_at).toLocaleString()}</dd>
            </dl>
            <div className="mt-4">
              <a
                href={getDownloadUrl(delivery.id)}
                className="rounded bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                下载成片
              </a>
            </div>
          </div>
        )}

        {isPhotographer && !delivery && order?.status === 'WAITING_DELIVERY' && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">上传成片</h3>
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
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
            />
            <p className="mt-2 text-xs text-gray-400">
              支持 JPEG/PNG/ZIP，最大 100MB
            </p>
          </div>
        )}

        {isPhotographer && delivery && order?.status === 'DELIVERED' && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium">归档</h3>
            <button
              onClick={() => {
                setError('')
                archiveMutation.mutate()
              }}
              disabled={archiveMutation.isPending}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-50 disabled:opacity-50"
            >
              归档订单
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
