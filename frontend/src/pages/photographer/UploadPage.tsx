import { useAuthStore } from '@/stores/auth'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { listPhotos, uploadPhoto, deletePhoto, type Photo } from '@/api/photos'
import { getOrder } from '@/api/orders'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, StatusBadge, EmptyState, LoadingState, ErrorState, Spinner } from '@/components/ui'

const STATUS_MAP: Record<string, string> = {
  PENDING_CONFIRM: 'pending', CONFIRMED: 'confirmed', WAITING_SHOOT: 'confirmed',
  WAITING_UPLOAD: 'confirmed', ANALYZING: 'analyzing', WAITING_REVIEW: 'analyzing',
  WAITING_SELECTION: 'confirmed', WAITING_RETOUCH: 'retouching', RETOUCHING: 'retouching',
  WAITING_CLIENT_CONFIRM: 'retouching', WAITING_DELIVERY: 'confirmed',
  DELIVERED: 'delivered', ARCHIVED: 'completed', CANCELLED: 'cancelled',
}

export function UploadPage() {
  const isPhotographer=useAuthStore(state=>state.user?.role==='photographer')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const orderId = Number(id)

  const { data: order, isError: orderError, refetch: refetchOrder } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(orderId),
    enabled: !!id,
  })

  const { data: photos, isLoading, isError, refetch } = useQuery({
    queryKey: ['photos', id],
    queryFn: () => listPhotos(orderId),
    enabled: !!id,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadPhoto(orderId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photo-catalog'] })
      queryClient.invalidateQueries({ queryKey: ['photos', id] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (photoId: number) => deletePhoto(orderId, photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photo-catalog'] })
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
      } catch (err) {
        setError(extractErrorMessage(err))
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
          <Button type="button" variant="plain" onClick={() => navigate(`/orders/${orderId}`)}>← 返回</Button>
        }
      />

      {order && (
        <ListGroup header="订单状态">
          <ListItem title="当前状态" trailing={<StatusBadge status={STATUS_MAP[order.status] || 'neutral'} />} isLast />
        </ListGroup>
      )}
      {orderError && <ErrorState title="订单状态加载失败" onRetry={() => { void refetchOrder() }} />}

      {isPhotographer && <div className="mx-4 mb-4"><Button variant="plain" onClick={() => navigate(`/orders/${id}/library`)}>照片图库</Button></div>}

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      <ListGroup header="选择照片">
        <ListItem
          title={uploading ? '上传中...' : '点击选择 JPEG 照片'}
          disabled={uploading}
          aria-busy={uploading}
          trailing={uploading ? <Spinner decorative size="sm" /> : undefined}
          subtitle="仅支持 JPEG 格式，单文件不超过 20MB"
          onClick={() => fileInputRef.current?.click()}
          showChevron
          isLast
        />
      </ListGroup>
      <input
        ref={fileInputRef}
        type="file"
        aria-label="选择 JPEG 照片"
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        onChange={handleFileSelect}
        disabled={uploading}
        className="hidden"
      />

      <ListGroup header={`已上传照片${photos ? ` (${photos.length})` : ''}`}>
        {isLoading ? (
          <LoadingState label="正在加载照片" />
        ) : isError ? (
          <ErrorState title="照片加载失败" onRetry={() => { void refetch() }} />
        ) : photos && photos.length > 0 ? (
          photos.map((photo: Photo, i) => (
            <ListItem
              key={photo.id}
              title={photo.filename}
              subtitle={`${photo.width && photo.height ? `${photo.width}×${photo.height} · ` : ''}${(photo.size_bytes / 1024).toFixed(0)} KB`}
              trailing={
                <div className="flex items-center gap-2">
                  <Button type="button" variant="tinted" size="sm" aria-label={`编辑 ${photo.filename}`}
                    onClick={() => navigate(`/orders/${orderId}/photos/${photo.id}/edit`)}>基础修图</Button>
                {canDelete ? (
                  <Button type="button" variant="destructive" size="sm" aria-label={`删除 ${photo.filename}`} disabled={deleteMutation.isPending} loading={deleteMutation.isPending && deleteMutation.variables === photo.id} onClick={() => { setError(''); deleteMutation.mutate(photo.id) }}>
                    删除
                  </Button>
                ) : null}
                </div>
              }
              isLast={i === photos.length - 1}
            />
          ))
        ) : (
          <EmptyState title="暂无照片" description="选择 JPEG 照片上传后，可查看分析结果。" />
        )}
      </ListGroup>

      {photos && photos.length > 0 && (
        <div className="px-4 pt-4">
          <Button effect="beam" onClick={() => navigate(`/orders/${orderId}/analysis`)}>查看分析结果</Button>
        </div>
      )}
    </Layout>
  )
}
