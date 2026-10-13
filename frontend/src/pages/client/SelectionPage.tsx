import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getOrderSelectionSet,
  submitSelection,
} from '@/api/selections'
import { Layout } from '@/components/Layout'
import { extractErrorMessage } from '@/api/auth'

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
    return (
      <Layout>
        <p className="text-sm text-gray-400">加载中...</p>
      </Layout>
    )
  }

  if (!selectionSet) {
    return (
      <Layout>
        <p className="text-sm text-gray-400">选片集不存在</p>
      </Layout>
    )
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
      <div className="space-y-6">
        <div>
          <button
            onClick={() => navigate('/client')}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            返回
          </button>
          <h2 className="mt-2 text-lg font-medium">选片 - 订单 #{orderId}</h2>
          <p className="mt-1 text-sm text-gray-400">
            最多选择 {maxSelect} 张，已选 {selected.size} 张，剩余 {remaining} 张
          </p>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {selectionSet.items.map((item) => {
            const isSelected = selected.has(item.photo_id)
            return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.photo_id)}
                className={`cursor-pointer rounded border p-4 transition ${
                  isSelected
                    ? 'border-black bg-gray-50'
                    : 'border-gray-200 bg-white hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-gray-400">
                    #{item.photo_id}
                  </span>
                  {isSelected && (
                    <span className="text-sm font-medium text-black">已选</span>
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-400">
                  照片 {item.photo_id}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || submitMutation.isPending}
            className="rounded bg-black px-6 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            提交选片
          </button>
        </div>
      </div>
    </Layout>
  )
}
