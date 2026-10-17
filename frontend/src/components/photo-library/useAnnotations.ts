import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react'
import {useQueryClient,type InfiniteData} from '@tanstack/react-query'
import {batchAnnotations,readAnnotation,type Annotation,type AnnotationChanges} from '@/api/photoAnnotations'
import type {PhotoAsset,CatalogPage} from '@/api/photoCatalog'
import {catalogKey} from './usePhotoCatalog'
import {sensitiveCatalog} from '@/utils/catalogFilters'
export const assetAnnotation=(a:PhotoAsset):Annotation=>({photoId:a.id,rating:a.rating,colorLabel:a.colorLabel,pickStatus:a.pickStatus,revision:a.annotationRevision})
export function mergeAnnotation(asset:PhotoAsset,a:Annotation):PhotoAsset{return {...asset,rating:a.rating,colorLabel:a.colorLabel,pickStatus:a.pickStatus,annotationRevision:a.revision}}
export interface AnnotationIssue {id:number;message:string}
const activeScopes=new Set<string>(),scopeListeners=new Set<()=>void>()
const subscribeScopes=(listener:()=>void)=>{scopeListeners.add(listener);return()=>{scopeListeners.delete(listener)}}
const notifyScopes=()=>scopeListeners.forEach(listener=>listener())
/** One bounded user operation per library. Writes outlive virtual cards; no automatic conflict retries. */
export function useAnnotations(userId:number,orderId:number,assets:PhotoAsset[]){
  const scope=`${userId}:${orderId}`
  const sharedBusy=useSyncExternalStore(subscribeScopes,()=>activeScopes.has(scope),()=>false)
  const client=useQueryClient(),latest=useRef(assets)
  useLayoutEffect(()=>{latest.current=assets},[assets])
  const active=useRef(false),alive=useRef(true),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[issues,setIssues]=useState<AnnotationIssue[]>([])
  const retryIntent=useRef<{ids:number[];changes:AnnotationChanges}|null>(null)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const key=catalogKey(userId,orderId)
  const patch=(annotations:Annotation[],restoreOnly?:AnnotationChanges)=>{
    const map=new Map(annotations.map(a=>[a.photoId,a]))
    const updateAsset=(asset:PhotoAsset)=>{
      const a=map.get(asset.id)
      if(!a||a.revision<asset.annotationRevision)return asset
      return restoreOnly?{...asset,...('rating' in restoreOnly?{rating:a.rating}:{}),...('colorLabel' in restoreOnly?{colorLabel:a.colorLabel}:{}),...('pickStatus' in restoreOnly?{pickStatus:a.pickStatus}:{})}:mergeAnnotation(asset,a)
    }
    client.setQueriesData<InfiniteData<CatalogPage>>({queryKey:key},data=>data?{...data,pages:data.pages.map(page=>({...page,items:page.items.map(updateAsset)}))}:data)
    for(const a of annotations)client.setQueryData<PhotoAsset>(['photo-asset',userId,orderId,a.photoId],old=>old?updateAsset(old):old)
  }
  async function apply(ids:number[],changes:AnnotationChanges,refresh=false){
    if(active.current||activeScopes.has(scope)||!ids.length)return
    if(activeScopes.size>=2){setProgress('已有两个图库操作正在完成，请稍后重试。');return}
    active.current=true;activeScopes.add(scope);notifyScopes();setBusy(true);setIssues([]);setProgress(`准备处理 ${ids.length} 张`)
    const failures:AnnotationIssue[]=[],originals=new Map<number,Annotation>()
    let done=0
    try{
      await client.cancelQueries({queryKey:key})
      for(const id of ids){const asset=latest.current.find(a=>a.id===id);if(asset)originals.set(id,assetAnnotation(asset))}
      if(refresh){
        for(const id of ids){try{const current=await readAnnotation(id);originals.set(id,current);patch([current])}catch{originals.delete(id);failures.push({id,message:'读取最新标记失败，未重试写入'})}}
      }
      const valid=ids.filter(id=>originals.has(id))
      for(let offset=0;offset<valid.length;offset+=100){
        const chunk=valid.slice(offset,offset+100),before=chunk.map(id=>originals.get(id)!)
        // Optimistic fields only; revision stays authoritative until acknowledged.
        patch(before.map(a=>({...a,...changes})))
        try{
          const results=await batchAnnotations(before.map(a=>({photoId:a.photoId,revision:a.revision})),changes)
          patch(results.map(r=>r.annotation));done+=results.filter(r=>r.status==='success').length
          failures.push(...results.filter(r=>r.status==='conflict').map(r=>({id:r.photoId,message:'版本冲突：已显示服务器最新值，请确认后重试'})))
        }catch{
          patch(before,changes)
          // A lost response is uncertain. Never automatically replay; explicit retry reads revisions first.
          for(const id of valid.slice(offset))failures.push({id,message:'提交结果不确定或请求失败，请读取最新版本后重试'})
          break
        }
        if(alive.current)setProgress(`已成功 ${done} / ${ids.length} 张`)
      }
      retryIntent.current=failures.length?{ids:failures.map(f=>f.id),changes}:null
      if(alive.current){setIssues(failures);setProgress(`成功 ${done} 张；需处理 ${failures.length} 张`)}
    }finally{
      // Filter/rating-sort membership is server-owned: restart each affected sequence from page one.
      await client.resetQueries({predicate:q=>q.queryKey[0]==='photo-catalog'&&q.queryKey[1]===userId&&q.queryKey[2]===orderId&&typeof q.queryKey[3]==='string'&&sensitiveCatalog(q.queryKey[3])})
      await client.invalidateQueries({queryKey:['metadata-timeline',userId,orderId]})
      active.current=false;activeScopes.delete(scope);notifyScopes();if(alive.current)setBusy(false)
    }
  }
  return {busy:busy||sharedBusy,progress,issues,apply,retry:()=>{const intent=retryIntent.current;if(intent&&!active.current)void apply(intent.ids,intent.changes,true)},dismiss:()=>{setIssues([]);retryIntent.current=null}}
}
