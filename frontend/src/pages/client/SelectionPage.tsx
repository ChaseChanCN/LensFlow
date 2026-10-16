import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getOrderSelectionSet,
  submitSelection,
} from '@/api/selections'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, Button, Badge, EmptyState, LoadingState, ErrorState } from '@/components/ui'

export function SelectionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  const orderId = Number(id)

  const { data: selectionSet, isLoading, isError, refetch } = useQuery({
    queryKey: ['selection-set', id],
    queryFn: () => getOrderSelectionSet(orderId),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: (photoIds: number[]) => submitSelection(selectionSet!.id, photoIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['selection-set', id] })
      navigate('/client')
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (isLoading) {
    return <Layout><LoadingState label="正在加载选片集" /></Layout>
  }

  if (isError) return <Layout><ErrorState title="选片集加载失败" onRetry={() => { void refetch() }} /></Layout>
  if (!selectionSet) {
    return <Layout><EmptyState title="选片集不存在" action={{ label: '返回我的', onClick: () => navigate('/client') }} /></Layout>
  }

  const maxSelect = selectionSet.max_select
  const remaining = maxSelect - selected.size

  const toggleSelect = (photoId: number) => {
    setError('')
    const next = new Set(selected)
    if (next.has(photoId)) {
      next.delete(photoId)
    } else {
      if (next.size >= maxSelect) return
      next.add(photoId)
    }
    setSelected(next)
  }

  const handleSubmit = () => {
    if (selected.size === 0) {
      setError('请至少选择一张照片')
      return
    }
    submitMutation.mutate(Array.from(selected))
  }

  return (
    <Layout title="LensFlow">
      <LargeTitle
        title="选片"
        subtitle={`订单 #${orderId} · 最多 ${maxSelect} 张，已选 ${selected.size} 张，剩余 ${remaining} 张`}
        action={
          <Button type="button" variant="plain" onClick={() => navigate('/client')}>← 返回</Button>
        }
      />

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      {selectionSet.items.length === 0 && <EmptyState title="暂无可选照片" description="摄影师发布照片后即可选片。" />}
      <p role="status" className="sr-only">已选 {selected.size} 张，剩余 {remaining} 张</p>
      <div className="grid grid-cols-2 gap-3 px-4 md:grid-cols-3" role="group" aria-label="可选照片">
        {selectionSet.items.map((item) => {
          const isSelected = selected.has(item.photo_id)
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isSelected}
              disabled={submitMutation.isPending || (!isSelected && remaining <= 0)}
              onClick={() => toggleSelect(item.photo_id)}
              className={`rounded-card p-4 text-left transition-shadow duration-[var(--duration-fast)] active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong ${
                isSelected
                  ? 'bg-info-bg ring-2 ring-action-primary-strong shadow-card'
                  : 'bg-system-bg shadow-card hover:shadow-elevated'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-body-sm text-label-muted">#{item.photo_id}</span>
                {isSelected && <Badge tone="accent">已选</Badge>}
              </div>
              <div className="mt-2 text-body-sm text-label-muted">照片 {item.photo_id}</div>
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-6">
        <Button type="button" size="lg" fullWidth onClick={handleSubmit} loading={submitMutation.isPending} disabled={selected.size === 0}>
          提交选片
        </Button>
      </div>
    </Layout>
  )
}
