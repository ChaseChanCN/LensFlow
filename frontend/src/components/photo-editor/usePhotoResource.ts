import { useEffect, useState } from 'react'
import { getPreviewSourceHash, getPreviewSourceSize, imageErrorMessage, loadPhotoPreview } from '@/api/imageEdit'
import { decodePhoto, type PhotoResource } from './imageResource'

type LoadState = { photoId: number; attempt: number; resource?: PhotoResource; error?: string }

export function usePhotoResource(photoId: number) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ photoId, attempt })
  useEffect(() => {
    const controller = new AbortController()
    let active = true, owned: PhotoResource | undefined
    void (async () => {
      try {
        const blob = await loadPhotoPreview(photoId, controller.signal)
        if (!active) return
        const resource = await decodePhoto(blob)
        resource.sourceSha256 = getPreviewSourceHash(blob)
        const size=getPreviewSourceSize(blob)
        if(size) {resource.sourceWidth=size[0];resource.sourceHeight=size[1]}
        if (!active) { resource.dispose(); return }
        owned = resource
        setState({ photoId, attempt, resource })
      } catch (error) {
        if (!active) return
        const message = await imageErrorMessage(error)
        if (active) setState({ photoId, attempt, error: message })
      }
    })()
    return () => { active = false; controller.abort(); owned?.dispose() }
  }, [photoId, attempt])
  const current = state.photoId === photoId && state.attempt === attempt ? state : { photoId, attempt }
  return { ...current, retry: () => setAttempt(value => value + 1) }
}
