import { useThumbnail } from './useThumbnail'
import type { PhotoAsset } from '@/api/photoCatalog'
import type { ThumbnailPool,ThumbnailSize } from './ThumbnailPool'
export function AssetThumbnail({asset,pool,size}:{asset:PhotoAsset;pool:ThumbnailPool;size:ThumbnailSize}){
  const state=useThumbnail(pool,asset.id,size)
  if(state.status==='ready'&&state.url)return <img src={state.url} alt={asset.filename} draggable={false} loading="lazy"/>
  if(state.status==='error')return <span className="asset-thumbnail-error"><span>{state.error}</span><button type="button" onClick={event=>{event.stopPropagation();pool.retry(asset.id,size)}}>重试缩略图</button></span>
  return <span className="asset-thumbnail-loading" aria-label="正在加载缩略图">加载中</span>
}
