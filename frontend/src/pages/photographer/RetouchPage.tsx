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

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  in_progress: '进行中',
  preview_uploaded: '已上传预览',
  confirmed: '已确认',
  rejected: '需修改',
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retouch-tasks', id] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (isLoading) {
    return (
      <Layout>
        <p className="text-sm text-gray-400">加载中...</p>
      </Layout>
    )
  }

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
          <h2 className="mt-2 text-lg font-medium">修图协作 - 订单 #{orderId}</h2>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {tasks && tasks.length > 0 ? (
          <div className="space-y-4">
            {tasks.map((task) => (
              <RetouchTaskCard
                key={task.id}
                task={task}
                isPhotographer={isPhotographer}
              />
            ))}

            {!isPhotographer && (
              <button
                onClick={() => {
                  setError('')
                  confirmMutation.mutate()
                }}
                disabled={confirmMutation.isPending}
                className="rounded bg-black px-6 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                确认全部修图
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">暂无修图任务</p>
        )}
      </div>
    </Layout>
  )
}

function RetouchTaskCard({
  task,
  isPhotographer,
}: {
  task: RetouchTask
  isPhotographer: boolean
}) {
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
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-gray-400">#{task.id}</span>
          <span className="text-sm font-medium">照片 {task.photo_id}</span>
        </div>
        <span className="text-sm text-gray-400">
          {TASK_STATUS_LABELS[task.status] || task.status}
        </span>
      </div>

      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {isPhotographer && (
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,.jpg,.jpeg,image/png,.png"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                setError('')
                uploadMutation.mutate(file)
              }
            }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
          />
        </div>
      )}

      {versions && versions.length > 0 && (
        <div className="mt-3 space-y-1">
          <h4 className="text-sm font-medium">预览版本</h4>
          {versions.map((v: RetouchVersion) => (
            <div key={v.id} className="flex items-center gap-3 text-sm">
              <span className="text-gray-400">v{v.version_no}</span>
              <span>{v.storage_key}</span>
              <span className="text-gray-400">
                {new Date(v.uploaded_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {feedbacks && feedbacks.length > 0 && (
        <div className="mt-3 space-y-1">
          <h4 className="text-sm font-medium">客户反馈</h4>
          {feedbacks.map((f: RetouchFeedback) => (
            <div key={f.id} className="text-sm">
              <span className="text-gray-400">
                {new Date(f.created_at).toLocaleString()}:
              </span>
              <span className="ml-2">{f.content}</span>
            </div>
          ))}
        </div>
      )}

      {!isPhotographer && (
        <div className="mt-3 space-y-2">
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="输入反馈意见..."
            className="block w-full rounded border border-gray-200 px-3 py-2 text-sm"
            rows={2}
          />
          <button
            onClick={() => {
              if (feedbackText.trim()) {
                setError('')
                feedbackMutation.mutate(feedbackText)
              }
            }}
            disabled={!feedbackText.trim() || feedbackMutation.isPending}
            className="rounded border border-gray-300 px-4 py-1 text-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            提交反馈
          </button>
        </div>
      )}
    </div>
  )
}
