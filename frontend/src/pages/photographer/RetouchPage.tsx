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
import { LargeTitle, ListGroup, ListItem, Button, Textarea, StatusBadge } from '@/components/ui'

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

  const { data: tasks, isLoading } = useQuery({
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
    return <Layout><p className="px-4 text-sm text-label-tertiary">加载中...</p></Layout>
  }

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title="修图协作"
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

      {tasks && tasks.length > 0 ? (
        <>
          {tasks.map((task) => (
            <RetouchTaskSection key={task.id} task={task} isPhotographer={isPhotographer} />
          ))}

          {!isPhotographer && (
            <div className="px-4 pt-4">
              <Button size="lg" fullWidth onClick={() => { setError(''); confirmMutation.mutate() }} disabled={confirmMutation.isPending}>
                确认全部修图
              </Button>
            </div>
          )}
        </>
      ) : (
        <ListGroup>
          <ListItem title="暂无修图任务" isLast />
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

  const { data: versions } = useQuery({
    queryKey: ['retouch-versions', task.id],
    queryFn: () => listRetouchVersions(task.id),
  })

  const { data: feedbacks } = useQuery({
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
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {isPhotographer && (
        <ListGroup header="上传预览">
          <ListItem
            title="点击选择预览图"
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
        accept="image/jpeg,.jpg,.jpeg,image/png,.png"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) { setError(''); uploadMutation.mutate(file) }
        }}
        className="hidden"
      />

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
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="输入反馈意见..."
              rows={2}
            />
          </div>
          <div className="px-4 pt-3">
            <Button
              variant="tinted"
              onClick={() => { if (feedbackText.trim()) { setError(''); feedbackMutation.mutate(feedbackText) } }}
              disabled={!feedbackText.trim() || feedbackMutation.isPending}
            >
              提交反馈
            </Button>
          </div>
        </>
      )}
    </>
  )
}
