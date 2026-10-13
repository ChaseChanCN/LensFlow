import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  listPhotos,
  getAnalysis,
  reviewAnalysis,
  type Photo,
} from '@/api/photos'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, ListGroup, ListItem, Button, Badge } from '@/components/ui'

const SUGGESTION_LABELS: Record<string, string> = {
  no_issue: '正常', need_review: '需复核', suggest_exclude: '建议剔除',
}

const RISK_TONE: Record<string, 'neutral' | 'warning' | 'error'> = {
  low: 'neutral', medium: 'warning', high: 'error',
}

const DECISION_LABELS: Record<string, string> = {
  pending: '待定', keep: '保留', exclude: '剔除',
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
    mutationFn: (params: { analysisId: number; decision: 'exclude' | 'keep' | 'pending' }) =>
      reviewAnalysis(params.analysisId, params.decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', id] })
      queryClient.invalidateQueries({ queryKey: ['analysis'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (isLoading) {
    return <Layout><p className="px-4 text-sm text-label-tertiary">加载中...</p></Layout>
  }

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title="AI 分析结果"
        subtitle={`订单 #${orderId}`}
        action={
          <button onClick={() => navigate(`/orders/${orderId}/upload`)} className="text-sm font-medium text-accent hover:text-accent-hover">
            ← 返回
          </button>
        }
      />

      {error && (
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {photos && photos.length > 0 ? (
        photos.map((photo: Photo) => (
          <AnalysisSection
            key={photo.id}
            photo={photo}
            onReview={(analysisId, decision) => {
              setError('')
              reviewMutation.mutate({ analysisId, decision })
            }}
            isPending={reviewMutation.isPending}
          />
        ))
      ) : (
        <ListGroup>
          <ListItem title="暂无照片" isLast />
        </ListGroup>
      )}
    </Layout>
  )
}

function AnalysisSection({
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
      <ListGroup header={`#${photo.id} ${photo.filename}`}>
        <ListItem title="分析中..." isLast />
      </ListGroup>
    )
  }

  return (
    <>
      <ListGroup header={`#${photo.id} ${photo.filename}`}>
        <ListItem title="清晰度" trailing={analysis.sharpness_score?.toFixed(1) ?? '-'} />
        <ListItem title="亮度" trailing={analysis.brightness_mean?.toFixed(1) ?? '-'} />
        <ListItem title="高光比例" trailing={`${((analysis.highlight_ratio ?? 0) * 100).toFixed(1)}%`} />
        <ListItem title="暗部比例" trailing={`${((analysis.shadow_ratio ?? 0) * 100).toFixed(1)}%`} />
        <ListItem title="AI 建议" trailing={SUGGESTION_LABELS[analysis.suggestion] || analysis.suggestion} />
        <ListItem title="风险等级" trailing={<Badge tone={RISK_TONE[analysis.risk_level] || 'neutral'}>{analysis.risk_level}</Badge>} />
        <ListItem title="复核状态" trailing={analysis.reviewed ? DECISION_LABELS[analysis.final_decision] || analysis.final_decision : '未复核'} isLast />
      </ListGroup>

      <div className="flex gap-2 px-4 pt-3 pb-2">
        <Button variant="tinted" size="sm" onClick={() => onReview(analysis.id, 'keep')} disabled={isPending}>
          保留
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onReview(analysis.id, 'exclude')} disabled={isPending}>
          剔除
        </Button>
        <Button variant="gray" size="sm" onClick={() => onReview(analysis.id, 'pending')} disabled={isPending}>
          待定
        </Button>
      </div>
    </>
  )
}
