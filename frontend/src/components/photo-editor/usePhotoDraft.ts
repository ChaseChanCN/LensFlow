import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { DraftSession } from './DraftSession'

export function usePhotoDraft(photoId: number, sourceHash?: string) {
  const session = useMemo(() => new DraftSession(photoId, sourceHash), [photoId, sourceHash])
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => { session.start(); return session.dispose }, [session])
  return { state, session }
}
