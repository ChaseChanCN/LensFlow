import { useEffect, useState } from 'react'
import { imageErrorMessage, renderPhotoPreview } from '@/api/imageEdit'
import { editsKey, isZeroEdit, type ImageEdits } from '@/utils/imageEdit'
import { decodePhoto, type PhotoResource } from './imageResource'

export const PREVIEW_DEBOUNCE_MS = 650
type SyncState = {
  key: string; base?: PhotoResource; status: 'waiting' | 'syncing' | 'synced' | 'error'
  resource?: PhotoResource; error?: string; lease?: { active: boolean }
}

export function useServerPreview(photoId: number, edit: ImageEdits, base?: PhotoResource) {
  const serialized=JSON.stringify(edit)
  const [attempt, setAttempt] = useState(0)
  const key = `${photoId}:${editsKey(edit)}:${attempt}`
  const [state, setState] = useState<SyncState>({ key: '', status: 'waiting' })
  useEffect(() => {
    const edit = JSON.parse(serialized) as ImageEdits
    if (!base || isZeroEdit(edit)) return
    const controller = new AbortController()
    const lease = { active: true }
    let active = true, owned: PhotoResource | undefined
    const timer = window.setTimeout(() => {
      setState({ key, base, status: 'syncing' })
      void (async () => {
        try {
          const blob = await renderPhotoPreview(photoId, edit, controller.signal)
          if (!active) return
          const resource = await decodePhoto(blob)
          if (!active) { resource.dispose(); return }
          owned = resource
          setState({ key, base, status: 'synced', resource, lease })
        } catch (error) {
          if (!active) return
          const message = await imageErrorMessage(error)
          if (active) setState({ key, base, status: 'error', error: message })
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)
    return () => { active = false; lease.active = false; clearTimeout(timer); controller.abort(); owned?.dispose() }
  }, [photoId, serialized, base, key])
  const current: SyncState = base && isZeroEdit(edit)
    ? { key, base, status: 'synced' }
    : state.key === key && state.base === base && (!state.resource || state.lease?.active)
      ? state : { key, base, status: 'waiting' }
  return { ...current, retry: () => setAttempt(value => value + 1) }
}
