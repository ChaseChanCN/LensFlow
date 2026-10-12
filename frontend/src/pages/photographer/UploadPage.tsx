import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { listPhotos, uploadPhoto, deletePhoto, type Photo } from '@/api/photos'
import { getOrder } from '@/api/orders'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'

const STATUS_LABELS: Record<string, string> = {
  PENDING_CONFIRM: '待确认', CONFIRMED: '已确认', WAITING_SHOOT: '待拍摄',
  WAITING_UPLOAD: '待上传', ANALYZING: '分析中', WAITING_REVIEW: '待复核',
  WAITING_SELECTION: '待选片', WAITING_RETOUCH: '待修图', RETOUCHING: '修图中',
  WAITING_CLIENT_CONFIRM: '待客户确认', WAITING_DELIVERY: '待交付',
  DELIVERED: '已交付', ARCHIVED: '已归档', CANCELLED: '已取消',
}

export function UploadPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const orderId = Number(id)

  const { data: order } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(orderId),
    enabled: !!id,
  })

  const { data: photos, isLoading } = useQuery({
    queryKey: ['photos', id],
    queryFn: () => listPhotos(orderId),
    enabled: !!id,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadPhoto(orderId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', id] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (photoId: number) => deletePhoto(orderId, photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', id] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const canDelete =
    order?.status === 'WAITING_UPLOAD' || order?.status === 'ANALYZING'

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setError('')
    setUploading(true)
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.jpg') && !file.name.toLowerCase().endsWith('.jpeg')) {
        setError(`${file.name} 不是 JPEG 文件，已跳过`)
        continue
      }
      try {
        await uploadMutation.mutateAsync(file)
      } catch {
        setError(extractErrorMessage(uploadMutation.error))
      }
    }
    setUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Layout title="LensFlow">
      <div className="space-y-6">
        <div>
          <button
            onClick={() => navigate(`/orders/${orderId}`)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            返回订单
          </button>
          <h2 className="mt-2 text-lg font-medium">上传照片 - 订单 #{orderId}</h2>
          {order && (
            <p className="mt-1 text-sm text-gray-400">
              状态: {STATUS_LABELS[order.status] || order.status}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium">选择照片</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,.jpg,.jpeg"
            multiple
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
          />
          <p className="mt-2 text-xs text-gray-400">
            仅支持 JPEG 格式，单文件不超过 20MB
          </p>
          {uploading && (
            <p className="mt-2 text-sm text-gray-400">上传中...</p>
          )}
        </div>

        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium">
            已上传照片 {photos && `(${photos.length})`}
          </h3>
          {isLoading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : photos && photos.length > 0 ? (
            <div className="space-y-2">
              {photos.map((photo: Photo) => (
                <div
                  key={photo.id}
                  className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-gray-400">#{photo.id}</span>
                    <span>{photo.filename}</span>
                    <span className="text-gray-400">
                      {photo.width && photo.height
                        ? `${photo.width}x${photo.height}`
                        : ''}
                    </span>
                    <span className="text-gray-400">
                      {(photo.size_bytes / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {canDelete && (
                      <button
                        onClick={() => {
                          setError('')
                          deleteMutation.mutate(photo.id)
                        }}
                        className="text-gray-400 transition hover:text-red-600"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={() => navigate(`/orders/${orderId}/analysis`)}
                className="mt-3 rounded bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                查看分析结果
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无照片</p>
          )}
        </div>
      </div>
    </Layout>
  )
}
