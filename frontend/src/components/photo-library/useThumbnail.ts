import { useCallback,useSyncExternalStore } from 'react'
import type { ThumbnailPool,ThumbnailSize } from './ThumbnailPool'
export function useThumbnail(pool:ThumbnailPool,id:number,size:ThumbnailSize){
  const subscribe=useCallback((listener:()=>void)=>pool.subscribe(id,size,listener),[pool,id,size])
  const snapshot=useCallback(()=>pool.snapshot(id,size),[pool,id,size])
  return useSyncExternalStore(subscribe,snapshot,snapshot)
}
