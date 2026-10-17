import { useAuthStore } from '@/stores/auth'
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
import { LargeTitle, ListGroup, ListItem, Button, Badge, EmptyState, LoadingState, ErrorState } from '@/components/ui'
import { AnalysisActivity, BeamSurface } from '@/components/effects/EffectSurfaces'

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
  const isPhotographer=useAuthStore(state=>state.user?.role==='photographer')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const orderId = Number(id)

  const { data: photos, isLoading, isError, refetch } = useQuery({
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

  return (
    <Layout title="LensFlow" appearance="material">
      <div className="material-page-heading"><p className="material-eyeline">A CLOSER LOOK / INTELLIGENCE</p>
      <LargeTitle
        title="AI 分析结果"
        subtitle={`订单 #${orderId}`}
        action={
          <Button type="button" variant="plain" onClick={() => navigate(`/orders/${orderId}/upload`)}>← 返回</Button>
        }
      />
      </div>

      {isPhotographer && <div className="mx-4 mb-4"><Button variant="plain" onClick={() => navigate(`/orders/${id}/library`)}>照片图库</Button></div>}

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      {isLoading ? <div className="material-analysis-summary material-summary-placeholder" aria-hidden="true"><span /><span /></div> : !isError && photos && photos.length > 0 && <div className="material-analysis-summary"><BeamSurface><div className="material-analysis-summary-body"><span className="material-summary-symbol" aria-hidden="true">✳</span><div><span className="material-overline">INTELLIGENCE / OVERVIEW</span><p>已加载 {photos.length} 张照片，分析建议与人工复核结果见下方。</p></div><span className="material-summary-count" aria-hidden="true">{String(photos.length).padStart(2,'0')}</span></div></BeamSurface></div>}

      <div className="material-analysis-grid" data-photo-count={photos?.length ?? 0} aria-busy={isLoading}>
      {isLoading ? <div className="material-analysis-placeholder"><AnalysisActivity label="正在加载分析照片" /></div> : isError ? <ErrorState title="照片加载失败" onRetry={() => { void refetch() }} /> : photos && photos.length > 0 ? (
        photos.map((photo: Photo, index: number) => (
          <AnalysisSection
            key={photo.id}
            photo={photo}
            showActivity={index === 0}
            onReview={(analysisId, decision) => {
              setError('')
              reviewMutation.mutate({ analysisId, decision })
            }}
            isPending={reviewMutation.isPending}
            pendingDecision={reviewMutation.isPending && reviewMutation.variables?.analysisId ? reviewMutation.variables : undefined}
          />
        ))
      ) : (
        <ListGroup>
          <EmptyState title="暂无照片" description="上传照片后会显示 AI 分析结果。" action={{ label: '上传照片', onClick: () => navigate(`/orders/${orderId}/upload`) }} />
        </ListGroup>
      )}
      </div>
    </Layout>
  )
}

function AnalysisSection({
  photo,
  onReview,
  isPending,
  pendingDecision,
  showActivity,
}: {
  photo: Photo
  onReview: (analysisId: number, decision: 'exclude' | 'keep' | 'pending') => void
  isPending: boolean
  pendingDecision?: { analysisId: number; decision: 'exclude' | 'keep' | 'pending' }
  showActivity: boolean
}) {
  const navigate = useNavigate()
  const { data: analysis, isLoading, isError, refetch } = useQuery({
    queryKey: ['analysis', photo.id],
    queryFn: () => getAnalysis(photo.id),
  })

  if (isLoading) {
    return (
      <ListGroup header={`#${photo.id} ${photo.filename}`}>
        {showActivity ? <AnalysisActivity label={`正在读取分析 ${photo.filename}`} /> : <LoadingState label={`正在读取分析 ${photo.filename}`} />}
      </ListGroup>
    )
  }
  if (isError) return <ListGroup header={`#${photo.id} ${photo.filename}`}><ErrorState title="分析结果加载失败" onRetry={() => { void refetch() }} /></ListGroup>
  if (!analysis) return <ListGroup header={`#${photo.id} ${photo.filename}`}><EmptyState title="暂无分析结果" /></ListGroup>

  return (
    <section className="material-analysis-photo" aria-label={`照片 ${photo.filename}`}>
      <div className="px-4 pt-3"><Button variant="plain" size="sm"
        onClick={() => navigate(`/orders/${photo.order_id}/photos/${photo.id}/edit`)}>基础修图</Button></div>
      <header className="material-analysis-photo-heading"><span className="material-overline">FRAME / {String(photo.id).padStart(3,'0')}</span><h2>{`#${photo.id} ${photo.filename}`}</h2><span className="material-analysis-photo-tag">图像分析</span></header>
      <div className="material-metrics">
        <ListItem title="清晰度" trailing={analysis.sharpness_score?.toFixed(1) ?? '-'} />
        <ListItem title="亮度" trailing={analysis.brightness_mean?.toFixed(1) ?? '-'} />
        <ListItem title="高光比例" trailing={`${((analysis.highlight_ratio ?? 0) * 100).toFixed(1)}%`} />
        <ListItem title="暗部比例" trailing={`${((analysis.shadow_ratio ?? 0) * 100).toFixed(1)}%`} />
        <ListItem title="AI 建议" trailing={SUGGESTION_LABELS[analysis.suggestion] || analysis.suggestion} />
        <ListItem title="风险等级" trailing={<Badge tone={RISK_TONE[analysis.risk_level] || 'neutral'}>{analysis.risk_level}</Badge>} />
        <ListItem title="复核状态" trailing={analysis.reviewed ? DECISION_LABELS[analysis.final_decision] || analysis.final_decision : '未复核'} isLast />
      </div>

      <div className="material-review-actions flex gap-2 px-4 pt-3 pb-2">
        <Button type="button" variant="tinted" size="sm" onClick={() => onReview(analysis.id, 'keep')} disabled={isPending} loading={pendingDecision?.analysisId === analysis.id && pendingDecision.decision === 'keep'}>
          保留
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => onReview(analysis.id, 'exclude')} disabled={isPending} loading={pendingDecision?.analysisId === analysis.id && pendingDecision.decision === 'exclude'}>
          剔除
        </Button>
        <Button type="button" variant="gray" size="sm" onClick={() => onReview(analysis.id, 'pending')} disabled={isPending} loading={pendingDecision?.analysisId === analysis.id && pendingDecision.decision === 'pending'}>
          待定
        </Button>
      </div>
    </section>
  )
}
