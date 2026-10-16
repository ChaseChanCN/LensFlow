import { EmptyState } from './EmptyState'
import { Spinner } from './Spinner'

export function LoadingState({ label = '加载中' }: { label?: string }) {
  return <div className="flex justify-center p-6"><Spinner label={label} /></div>
}

export function ErrorState({ title = '加载失败', onRetry }: { title?: string; onRetry?: () => void }) {
  return <div role="alert" className="mx-4 rounded-card bg-error-bg"><EmptyState title={title} description="请稍后重试。" action={onRetry ? { label: '重试', onClick: onRetry } : undefined} /></div>
}
