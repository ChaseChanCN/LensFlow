import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  listRetouchTasks,
  uploadRetouchVersion,
  listRetouchVersions,
  createFeedback,
  listFeedback,
  confirmAllRetouch,
  type RetouchTask,
  type RetouchVersion,
  type RetouchFeedback,
} from '@/api/retouch'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { LargeTitle, ListGroup, ListItem, Button, Textarea, StatusBadge, EmptyState, LoadingState, ErrorState, Spinner } from '@/components/ui'

const TASK_STATUS_MAP: Record<string, string> = {
  pending: 'pending', in_progress: 'analyzing', preview_uploaded: 'confirmed',
  confirmed: 'completed', rejected: 'cancelled',
}

export function RetouchPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const user = useAuthStore((s) => s.user)
  const isPhotographer = user?.role === 'photographer'
  const orderId = Number(id)

  const { data: tasks, isLoading, isError, refetch } = useQuery({
    queryKey: ['retouch-tasks', id],
    queryFn: () => listRetouchTasks(orderId),
    enabled: !!id,
  })

  const confirmMutation = useMutation({
    mutationFn: () => confirmAllRetouch(orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['retouch-tasks', id] }),
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (isLoading) {
    return <Layout><LoadingState label="正在加载修图任务" /></Layout>
  }

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title="修图协作"
        subtitle={`订单 #${orderId}`}
        action={
          <Button type="button" variant="plain" onClick={() => navigate(-1)}>← 返回</Button>
        }
      />

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      {isError ? <ErrorState title="修图任务加载失败" onRetry={() => { void refetch() }} /> : tasks && tasks.length > 0 ? (
        <>
          {tasks.map((task) => (
            <RetouchTaskSection key={task.id} task={task} isPhotographer={isPhotographer} />
          ))}

          {!isPhotographer && (
            <div className="px-4 pt-4">
              <Button effect="beam" type="button" size="lg" fullWidth onClick={() => { setError(''); confirmMutation.mutate() }} loading={confirmMutation.isPending}>
                确认全部修图
              </Button>
            </div>
          )}
        </>
      ) : (
        <ListGroup>
          <EmptyState title="暂无修图任务" description="选片完成后，修图任务会显示在这里。" />
        </ListGroup>
      )}
    </Layout>
  )
}

function RetouchTaskSection({ task, isPhotographer }: { task: RetouchTask; isPhotographer: boolean }) {
  const [feedbackText, setFeedbackText] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: versions, isLoading: versionsLoading, isError: versionsError, refetch: refetchVersions } = useQuery({
    queryKey: ['retouch-versions', task.id],
    queryFn: () => listRetouchVersions(task.id),
  })

  const { data: feedbacks, isLoading: feedbacksLoading, isError: feedbacksError, refetch: refetchFeedback } = useQuery({
    queryKey: ['retouch-feedback', task.id],
    queryFn: () => listFeedback(task.id),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadRetouchVersion(task.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retouch-versions', task.id] })
      queryClient.invalidateQueries({ queryKey: ['retouch-tasks'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const feedbackMutation = useMutation({
    mutationFn: (content: string) => createFeedback(task.id, content),
    onSuccess: () => {
      setFeedbackText('')
      queryClient.invalidateQueries({ queryKey: ['retouch-feedback', task.id] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  return (
    <>
      <ListGroup header={`任务 #${task.id} · 照片 ${task.photo_id}`}>
        <ListItem title="状态" trailing={<StatusBadge status={TASK_STATUS_MAP[task.status] || 'neutral'} />} isLast />
      </ListGroup>

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      {isPhotographer && (
        <ListGroup header="上传预览">
          <ListItem
            title="点击选择预览图"
            disabled={uploadMutation.isPending}
            aria-busy={uploadMutation.isPending}
            trailing={uploadMutation.isPending ? <Spinner decorative size="sm" /> : undefined}
            subtitle="支持 JPEG/PNG"
            onClick={() => fileInputRef.current?.click()}
            showChevron
            isLast
          />
        </ListGroup>
      )}
      <input
        ref={fileInputRef}
        type="file"
        aria-label={`选择任务 #${task.id} 预览图`}
        disabled={uploadMutation.isPending}
        accept="image/jpeg,.jpg,.jpeg,image/png,.png"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) { setError(''); uploadMutation.mutate(file); e.target.value = '' }
        }}
        className="hidden"
      />

      {versionsLoading && <LoadingState label="正在加载预览版本" />}
      {versionsError && <ErrorState title="预览版本加载失败" onRetry={() => { void refetchVersions() }} />}
      {versions && versions.length === 0 && <ListGroup header="预览版本"><EmptyState title="暂无预览版本" /></ListGroup>}
      {versions && versions.length > 0 && (
        <ListGroup header="预览版本">
          {versions.map((v: RetouchVersion, i) => (
            <ListItem
              key={v.id}
              title={`版本 v${v.version_no}`}
              subtitle={v.storage_key}
              trailing={new Date(v.uploaded_at).toLocaleString()}
              isLast={i === versions.length - 1}
            />
          ))}
        </ListGroup>
      )}

      {feedbacksLoading && <LoadingState label="正在加载客户反馈" />}
      {feedbacksError && <ErrorState title="客户反馈加载失败" onRetry={() => { void refetchFeedback() }} />}
      {feedbacks && feedbacks.length === 0 && <ListGroup header="客户反馈"><EmptyState title="暂无客户反馈" /></ListGroup>}
      {feedbacks && feedbacks.length > 0 && (
        <ListGroup header="客户反馈">
          {feedbacks.map((f: RetouchFeedback, i) => (
            <ListItem
              key={f.id}
              title={f.content}
              trailing={new Date(f.created_at).toLocaleString()}
              isLast={i === feedbacks.length - 1}
            />
          ))}
        </ListGroup>
      )}

      {!isPhotographer && (
        <>
          <div className="px-4 pt-4">
            <Textarea
              label="反馈意见"
              aria-label={`任务 #${task.id} 反馈意见`}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="输入反馈意见..."
              rows={2}
            />
          </div>
          <div className="px-4 pt-3">
            <Button
              variant="tinted"
              type="button"
              onClick={() => { if (feedbackText.trim()) { setError(''); feedbackMutation.mutate(feedbackText) } }}
              disabled={!feedbackText.trim()}
              loading={feedbackMutation.isPending}
            >
              提交反馈
            </Button>
          </div>
        </>
      )}
    </>
  )
}
