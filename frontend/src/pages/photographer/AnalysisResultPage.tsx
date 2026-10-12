import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  listPhotos,
  getAnalysis,
  reviewAnalysis,
  type Photo,
  type AnalysisResult,
} from '@/api/photos'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'

const SUGGESTION_LABELS: Record<string, string> = {
  no_issue: '正常',
  need_review: '需复核',
  suggest_exclude: '建议剔除',
}

const RISK_COLORS: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-yellow-600',
  high: 'text-red-600',
}

const DECISION_LABELS: Record<string, string> = {
  pending: '待定',
  keep: '保留',
  exclude: '剔除',
}

export function AnalysisResultPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const orderId = Number(id)

  const { data: photos, isLoading } = useQuery({
    queryKey: ['photos', id],
    queryFn: () => listPhotos(orderId),
    enabled: !!id,
  })

  const reviewMutation = useMutation({
    mutationFn: (params: {
      analysisId: number
      decision: 'exclude' | 'keep' | 'pending'
    }) => reviewAnalysis(params.analysisId, params.decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', id] })
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
            onClick={() => navigate(`/orders/${orderId}/upload`)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            返回上传
          </button>
          <h2 className="mt-2 text-lg font-medium">AI 分析结果 - 订单 #{orderId}</h2>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {photos && photos.length > 0 ? (
          <div className="space-y-3">
            {photos.map((photo: Photo) => (
              <AnalysisCard
                key={photo.id}
                photo={photo}
                onReview={(analysisId, decision) => {
                  setError('')
                  reviewMutation.mutate({ analysisId, decision })
                }}
                isPending={reviewMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">暂无照片</p>
        )}
      </div>
    </Layout>
  )
}

function AnalysisCard({
  photo,
  onReview,
  isPending,
}: {
  photo: Photo
  onReview: (analysisId: number, decision: 'exclude' | 'keep' | 'pending') => void
  isPending: boolean
}) {
  const { data: analysis, isLoading } = useQuery({
    queryKey: ['analysis', photo.id],
    queryFn: () => getAnalysis(photo.id),
  })

  if (isLoading || !analysis) {
    return (
      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-400">
        #{photo.id} {photo.filename} - 分析中...
      </div>
    )
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-gray-400">#{photo.id}</span>
            <span className="text-sm font-medium">{photo.filename}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-gray-400">清晰度</span>
            <span>
              {analysis.sharpness_score?.toFixed(1) ?? '-'}
            </span>
            <span className="text-gray-400">亮度</span>
            <span>
              {analysis.brightness_mean?.toFixed(1) ?? '-'}
            </span>
            <span className="text-gray-400">高光比例</span>
            <span>
              {((analysis.highlight_ratio ?? 0) * 100).toFixed(1)}%
            </span>
            <span className="text-gray-400">暗部比例</span>
            <span>
              {((analysis.shadow_ratio ?? 0) * 100).toFixed(1)}%
            </span>
            <span className="text-gray-400">AI 建议</span>
            <span>
              {SUGGESTION_LABELS[analysis.suggestion] || analysis.suggestion}
            </span>
            <span className="text-gray-400">风险等级</span>
            <span className={RISK_COLORS[analysis.risk_level] || ''}>
              {analysis.risk_level}
            </span>
            <span className="text-gray-400">复核状态</span>
            <span>
              {analysis.reviewed
                ? DECISION_LABELS[analysis.final_decision] || analysis.final_decision
                : '未复核'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onReview(analysis.id, 'keep')}
          disabled={isPending}
          className="rounded border border-gray-300 px-3 py-1 text-sm transition hover:bg-gray-50 disabled:opacity-50"
        >
          保留
        </button>
        <button
          onClick={() => onReview(analysis.id, 'exclude')}
          disabled={isPending}
          className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          剔除
        </button>
        <button
          onClick={() => onReview(analysis.id, 'pending')}
          disabled={isPending}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-400 transition hover:bg-gray-50 disabled:opacity-50"
        >
          待定
        </button>
      </div>
    </div>
  )
}
