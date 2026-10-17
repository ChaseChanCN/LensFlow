import {useAnnotations} from '@/components/photo-library/useAnnotations'
import {selectAsset,reconcileSelection} from '@/components/photo-library/selection'
import {BatchToolbar} from '@/components/photo-library/BatchToolbar'
import {FilterBar} from '@/components/photo-library/FilterBar'
import {MetadataTools} from '@/components/photo-library/MetadataTools'
import {parseFilters,serializeFilters,editorPath,lightTablePath,sensitiveCatalog,type CatalogFilters} from '@/utils/catalogFilters'
import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react'
import { useNavigate,useParams,useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { Button,LargeTitle,LoadingState,ErrorState,EmptyState } from '@/components/ui'
import { useAuthStore } from '@/stores/auth'
import { imageErrorMessage } from '@/api/imageEdit'
import { usePhotoCatalog,catalogKey } from '@/components/photo-library/usePhotoCatalog'
import { ThumbnailPool } from '@/components/photo-library/ThumbnailPool'
import { AssetGrid,type LibraryViewState } from '@/components/photo-library/AssetGrid'
import { PhotoViewer } from '@/components/photo-library/PhotoViewer'
import '@/components/photo-library/photo-library.css'
const positions=new Map<string,LibraryViewState>()
const DEFAULT_VIEW:LibraryViewState={offset:0,density:'normal',focusedId:null}
export function PhotoLibraryPage(){
  const {id}=useParams(),user=useAuthStore(s=>s.user),orderId=Number(id)
  if(user?.role!=='photographer')return <Layout><ErrorState title="仅摄影师可使用照片图库"/></Layout>
  if(!Number.isSafeInteger(orderId)||orderId<1)return <Layout><ErrorState title="订单地址无效"/></Layout>
  return <LibrarySession key={`${user.id}:${orderId}`} userId={user.id} orderId={orderId}/>
}
function LibrarySession({userId,orderId}:{userId:number;orderId:number}){
  const token=useAuthStore(state=>state.token),[search,setSearch]=useSearchParams(),client=useQueryClient()
  const pool=useMemo(()=>new ThumbnailPool(Boolean(token)),[token])
  useEffect(()=>{pool.activate();return pool.dispose},[pool])
  let filters:CatalogFilters|undefined,error:string|undefined
  try{filters=parseFilters(search)}catch(e){error=e instanceof Error?e.message:'筛选地址无效'}
  const signature=filters?serializeFilters(filters):'invalid:'+search.toString()
  const previous=useRef(signature),[entry,setEntry]=useState({signature,restore:true})
  if(entry.signature!==signature)setEntry({signature,restore:false})
  useLayoutEffect(()=>{
    if(previous.current!==signature&&filters){const key=catalogKey(userId,orderId,filters);if(client.getQueryData(key))void client.resetQueries({queryKey:key,exact:true})}
    previous.current=signature
  },[signature,userId,orderId,client,filters])
  if(!filters)return <Layout><ErrorState title={error??'筛选地址无效'}/><Button onClick={()=>setSearch(new URLSearchParams())}>清除无效条件</Button></Layout>
  return <CatalogSession key={signature} userId={userId} orderId={orderId} pool={pool} filters={filters} restore={entry.signature===signature&&entry.restore} onFilters={next=>setSearch(new URLSearchParams(serializeFilters(next)))}/>
}
function CatalogSession({userId,orderId,pool,filters,restore,onFilters}:{userId:number;orderId:number;pool:ThumbnailPool;filters:CatalogFilters;restore:boolean;onFilters:(next:CatalogFilters)=>void}){
  const navigate=useNavigate(),queryClient=useQueryClient(),query=usePhotoCatalog(userId,orderId,filters),signature=serializeFilters(filters)
  const key=`${userId}:${orderId}:${signature}`,[initial,setInitial]=useState(()=>restore&&query.data?(positions.get(key)??DEFAULT_VIEW):DEFAULT_VIEW),view=useRef(initial)
  const saveView=useCallback((state:LibraryViewState)=>{view.current=state},[])
  useEffect(()=>()=>{positions.delete(key);positions.set(key,view.current);while(positions.size>16)positions.delete(positions.keys().next().value!)},[key])
  const [viewer,setViewer]=useState<number|null>(null)
  const items=useMemo(()=>query.data?.pages.flatMap(page=>page.items)??[],[query.data])
  const [selected,setSelected]=useState<Set<number>>(new Set()),anchor=useRef<number|null>(null)
  const annotations=useAnnotations(userId,orderId,items)
  const validSelection=useMemo(()=>reconcileSelection(selected,items.map(a=>a.id)),[selected,items])
  const [selectionOrder,setSelectionOrder]=useState(''),idsKey=items.map(a=>a.id).join(',')
  if(selectionOrder!==idsKey){setSelectionOrder(idsKey);if(validSelection.size!==selected.size)setSelected(validSelection)}
  const annotate=(ids:number[],changes:import('@/api/photoAnnotations').AnnotationChanges)=>{if(sensitiveCatalog(signature))setInitial({...view.current,offset:0});return annotations.apply(ids,changes)}
  const annotationBlocked=annotations.busy||annotations.issues.length>0
  const select=useCallback((id:number,event:{shiftKey:boolean;ctrlKey:boolean;metaKey:boolean})=>{
    if(id===-1){setSelected(new Set(items.map(a=>a.id)));return}
    if(id===-2){setSelected(new Set());anchor.current=null;return}
    setSelected(current=>{const next=selectAsset(current,items.map(a=>a.id),id,anchor.current,event);anchor.current=next.anchor;return next.selected})
  },[items])
  const {hasNextPage,isFetchingNextPage,isFetchNextPageError,fetchNextPage}=query
  const more=useCallback(()=>{if(hasNextPage&&!isFetchingNextPage&&!isFetchNextPageError)void fetchNextPage({cancelRefetch:false})},[hasNextPage,isFetchingNextPage,isFetchNextPageError,fetchNextPage])
  return <Layout><LargeTitle title="照片图库" subtitle={`订单 #${orderId} · 原始照片`} action={<Button variant="plain" onClick={()=>navigate(`/orders/${orderId}`)}>← 返回订单</Button>}/>
    <div className="asset-library">
      <FilterBar value={filters} onChange={onFilters} disabled={annotationBlocked}/>
      <MetadataTools userId={userId} orderId={orderId} value={filters} onChange={onFilters} disabled={annotationBlocked}/>
      <div className="flex gap-2 mb-4"><Button variant="plain" onClick={()=>navigate(`/orders/${orderId}/upload`)}>上传照片</Button><Button variant="plain" disabled={query.isFetching||annotations.busy} onClick={()=>{positions.delete(key);setInitial({...view.current,offset:0});void queryClient.resetQueries({queryKey:catalogKey(userId,orderId,filters),exact:true})}}>刷新图库</Button></div>
      {query.isPending?<LoadingState label="正在读取照片目录"/>:query.isError&&!items.length?<ErrorState title={imageErrorMessage(query.error)} onRetry={()=>{void query.refetch()}}/>:!items.length?<EmptyState title={signature?"没有符合条件的照片":"暂无照片"} description={signature?"调整或重置查询条件后重试。":"上传 JPEG 后即可在图库浏览。"}/>:<>
        <Button variant="plain" disabled={validSelection.size!==2||annotationBlocked} onClick={()=>navigate(lightTablePath(orderId,[...validSelection] as [number,number],signature))}>灯箱比较（选择两张）</Button>
        <BatchToolbar assets={items.filter(a=>validSelection.has(a.id))} busy={annotationBlocked} onChange={changes=>{void annotate([...validSelection],changes)}} onAll={()=>setSelected(new Set(items.map(a=>a.id)))} onClear={()=>setSelected(new Set())}/>
        <p className="asset-library-note">单击选择 · Ctrl/Cmd 切换 · Shift 范围 · 双击或“查看”打开 · 0–5 评分，P 保留 / X 拒绝 / U 清除标记。全选仅含已加载照片。</p>
        <AssetGrid selected={validSelection} onSelect={select} onMetadata={annotate} busy={annotationBlocked} items={items} pool={pool} hasMore={!!query.hasNextPage} fetching={query.isFetchingNextPage} onMore={more} onOpen={asset=>setViewer(asset.id)} initial={initial} onViewState={saveView}/>
        {query.isFetchNextPageError&&<div role="alert">下一页加载失败，已加载的照片仍可浏览。<Button variant="plain" onClick={()=>{void query.fetchNextPage({cancelRefetch:false})}}>重试下一页</Button></div>}
      </>}
    </div>
    <div role="status" aria-live="polite">{annotations.busy?'正在保存… ':''}{annotations.progress}</div>
    {!!annotations.issues.length&&<div role="alert"><p>{annotations.issues.length} 张标记未完成。成功项已保留。</p><ul>{annotations.issues.slice(0,10).map(issue=><li key={issue.id}>{items.find(a=>a.id===issue.id)?.filename??`照片 #${issue.id}`}：{issue.message}</li>)}</ul>{annotations.issues.length>10&&<p>其余 {annotations.issues.length-10} 张一并包含在重试范围中。</p>}<Button disabled={annotations.busy} onClick={annotations.retry}>读取最新版本并重试失败项</Button><Button variant="plain" disabled={annotations.busy} onClick={annotations.dismiss}>保留服务器值，关闭提示</Button></div>}
    {viewer!==null&&<PhotoViewer onMetadata={annotate} busy={annotationBlocked} notice={annotations.busy?'正在保存标记…':annotations.issues.length?'标记未完成。请关闭查看器，在图库选择读取最新版本重试或保留服务器值。':undefined} items={items} id={viewer} onSelect={setViewer} onClose={()=>setViewer(null)} onEdit={asset=>navigate(editorPath(orderId,asset.id,signature))}/>}
  </Layout>
}
