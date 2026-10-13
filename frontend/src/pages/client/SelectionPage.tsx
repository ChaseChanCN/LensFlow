import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getOrderSelectionSet,
  submitSelection,
} from '@/api/selections'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'
import { LargeTitle, Button, Badge } from '@/components/ui'

export function SelectionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  const orderId = Number(id)

  const { data: selectionSet, isLoading } = useQuery({
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
    return <Layout><p className="px-4 text-sm text-label-tertiary">加载中...</p></Layout>
  }

  if (!selectionSet) {
    return <Layout><p className="px-4 text-sm text-label-tertiary">选片集不存在</p></Layout>
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
          <button onClick={() => navigate('/client')} className="text-sm font-medium text-accent hover:text-accent-hover">
            ← 返回
          </button>
        }
      />

      {error && (
        <div className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-4 md:grid-cols-3">
        {selectionSet.items.map((item) => {
          const isSelected = selected.has(item.photo_id)
          return (
            <button
              key={item.id}
              onClick={() => toggleSelect(item.photo_id)}
              className={`rounded-card p-4 text-left transition-all duration-200 active:scale-95 ${
                isSelected
                  ? 'bg-accent/5 ring-2 ring-accent shadow-card'
                  : 'bg-system-bg shadow-card hover:shadow-elevated'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-label-tertiary">#{item.photo_id}</span>
                {isSelected && <Badge tone="accent">已选</Badge>}
              </div>
              <div className="mt-2 text-sm text-label-secondary">照片 {item.photo_id}</div>
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-6">
        <Button size="lg" fullWidth onClick={handleSubmit} disabled={selected.size === 0 || submitMutation.isPending}>
          提交选片
        </Button>
      </div>
    </Layout>
  )
}
