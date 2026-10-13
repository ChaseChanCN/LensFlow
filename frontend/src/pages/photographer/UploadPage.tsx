import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { listPhotos, uploadPhoto, deletePhoto, type Photo } from '@/api/photos'
import { getOrder } from '@/api/orders'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, StatusBadge } from '@/components/ui'

const STATUS_MAP: Record<string, string> = {
  PENDING_CONFIRM: 'pending', CONFIRMED: 'confirmed', WAITING_SHOOT: 'confirmed',
  WAITING_UPLOAD: 'confirmed', ANALYZING: 'analyzing', WAITING_REVIEW: 'analyzing',
  WAITING_SELECTION: 'confirmed', WAITING_RETOUCH: 'retouching', RETOUCHING: 'retouching',
  WAITING_CLIENT_CONFIRM: 'retouching', WAITING_DELIVERY: 'confirmed',
  DELIVERED: 'delivered', ARCHIVED: 'completed', CANCELLED: 'cancelled',
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

  const canDelete = order?.status === 'WAITING_UPLOAD' || order?.status === 'ANALYZING'

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title="上传照片"
        subtitle={`订单 #${orderId}`}
        action={
          <button onClick={() => navigate(`/orders/${orderId}`)} className="text-sm font-medium text-accent hover:text-accent-hover">
            ← 返回
          </button>
        }
      />

      {order && (
        <ListGroup header="订单状态">
          <ListItem title="当前状态" trailing={<StatusBadge status={STATUS_MAP[order.status] || 'neutral'} />} isLast />
        </ListGroup>
      )}

      {error && (
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <ListGroup header="选择照片">
        <ListItem
          title={uploading ? '上传中...' : '点击选择 JPEG 照片'}
          subtitle="仅支持 JPEG 格式，单文件不超过 20MB"
          onClick={() => fileInputRef.current?.click()}
          showChevron
          isLast
        />
      </ListGroup>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        onChange={handleFileSelect}
        disabled={uploading}
        className="hidden"
      />

      <ListGroup header={`已上传照片${photos ? ` (${photos.length})` : ''}`}>
        {isLoading ? (
          <ListItem title="加载中..." isLast />
        ) : photos && photos.length > 0 ? (
          photos.map((photo: Photo, i) => (
            <ListItem
              key={photo.id}
              title={photo.filename}
              subtitle={`${photo.width && photo.height ? `${photo.width}×${photo.height} · ` : ''}${(photo.size_bytes / 1024).toFixed(0)} KB`}
              trailing={
                canDelete ? (
                  <Button variant="plain" size="sm" onClick={(e) => { e.stopPropagation(); setError(''); deleteMutation.mutate(photo.id) }} className="!text-error hover:!text-error/80">
                    删除
                  </Button>
                ) : undefined
              }
              isLast={i === photos.length - 1}
            />
          ))
        ) : (
          <ListItem title="暂无照片" isLast />
        )}
      </ListGroup>

      {photos && photos.length > 0 && (
        <div className="px-4 pt-4">
          <Button onClick={() => navigate(`/orders/${orderId}/analysis`)}>查看分析结果</Button>
        </div>
      )}
    </Layout>
  )
}
