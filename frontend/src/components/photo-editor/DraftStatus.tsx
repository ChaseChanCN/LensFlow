import { Button } from '@/components/ui'
import type { DraftSession, DraftState } from './DraftSession'

const LABELS = { loading: '正在读取草稿', 'load-error': '草稿加载失败', saved: '已保存', dirty: '未保存更改',
  saving: '保存中', error: '保存失败', 'revision-conflict': '版本冲突', 'source-conflict': '原图冲突' }
export function DraftStatus({ state, session }: { state: DraftState; session: DraftSession }) {
  return <section className="photo-editor-draft" aria-label="草稿保存状态">
    <p role="status" aria-live="polite">{LABELS[state.status]}{state.updated_at && state.status === 'saved' ? ` · ${new Date(state.updated_at).toLocaleTimeString()}` : ''}</p>
    {state.error && <p role="alert">{state.error}</p>}
    {(state.status === 'error' || state.status === 'load-error') && <Button size="sm" variant="plain" onClick={session.retry}>重试草稿</Button>}
    {state.status === 'revision-conflict' && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="gray" onClick={session.reloadRemote}>加载远端并替换本地修改</Button>
      <Button size="sm" variant="plain" onClick={session.overwriteRemote}>用本地参数保存到最新版本</Button>
    </div>}
  </section>
}
