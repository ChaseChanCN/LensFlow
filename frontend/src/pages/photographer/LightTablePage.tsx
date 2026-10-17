import {useCallback,useMemo,useState} from 'react'
import {useNavigate,useParams,useSearchParams} from 'react-router-dom'
import {useQueries} from '@tanstack/react-query'
import {Layout} from '@/components/Layout'
import {Button,LargeTitle,ErrorState,LoadingState} from '@/components/ui'
import {useAuthStore} from '@/stores/auth'
import {loadAsset,type PhotoAsset} from '@/api/photoCatalog'
import {imageErrorMessage} from '@/api/imageEdit'
import {compareIds,parseFilters,serializeFilters,libraryPath,editorPath} from '@/utils/catalogFilters'
import {LightTablePanel} from '@/components/photo-library/LightTablePanel'
import {fitView,type CompareView} from '@/components/photo-library/lightTableMath'
import {editableTarget} from '@/components/photo-library/selection'
import {useAnnotations} from '@/components/photo-library/useAnnotations'
import '@/components/photo-library/photo-library.css'

export function LightTablePage(){
  const {id}=useParams(),[search]=useSearchParams(),user=useAuthStore(s=>s.user),orderId=Number(id)
  let pair:[number,number]|null=null,signature='',error:string|undefined
  try{if([...search.keys()].some(k=>!['a','b','library'].includes(k)||search.getAll(k).length!==1))throw Error('灯箱地址包含未知或重复参数');pair=compareIds(search.get('a'),search.get('b'));signature=serializeFilters(parseFilters(new URLSearchParams(search.get('library')??'')))}catch(e){error=e instanceof Error?e.message:'灯箱地址无效'}
  if(user?.role!=='photographer'||!Number.isSafeInteger(orderId)||orderId<1||!pair||error)return <Layout><ErrorState title={error??'灯箱需要当前订单中两张不同的照片，并以摄影师身份登录'}/></Layout>
  return <Comparison key={`${user.id}:${orderId}:${pair.join(',')}`} userId={user.id} orderId={orderId} pair={pair} signature={signature}/>
}
function Comparison({userId,orderId,pair,signature}:{userId:number;orderId:number;pair:[number,number];signature:string}){
  const navigate=useNavigate(),results=useQueries({queries:pair.map(id=>({queryKey:['photo-asset',userId,orderId,id],queryFn:({signal}:{signal:AbortSignal})=>loadAsset(orderId,id,signal),retry:false,staleTime:0}))})
  const assets=useMemo(()=>results.flatMap(r=>r.data?[r.data]:[]),[results]),annotations=useAnnotations(userId,orderId,assets)
  const [views,setViews]=useState<[CompareView,CompareView]>([fitView(),fitView()]),[synced,setSynced]=useState(false),[focused,setFocused]=useState(0)
  const [firstSettled,setFirstSettled]=useState(false),onFirstSettled=useCallback(()=>setFirstSettled(true),[setFirstSettled])
  const update=useCallback((index:number,view:CompareView)=>setViews(previous=>synced?[view,view]:previous.map((v,i)=>i===index?view:v) as [CompareView,CompareView]),[synced])
  const back=()=>navigate(libraryPath(orderId,signature)),blocked=annotations.busy||annotations.issues.length>0
  return <div onKeyDown={event=>{
    if(editableTarget(event.target)||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('[role="dialog"]'))return
    const key=event.key.toLowerCase(),asset=results[focused]?.data
    if(key==='escape'){event.preventDefault();back();return}
    if(!asset)return
    if(key==='f'||key==='+'||key==='='||key==='-'){event.preventDefault();update(focused,key==='f'?fitView():{...views[focused],zoom:Math.min(8,Math.max(1,views[focused].zoom*(key==='-'?.8:1.25)))});return}
    const changes=/^[0-5]$/.test(key)?{rating:Number(key)}:key==='p'?{pickStatus:'pick' as const}:key==='x'?{pickStatus:'reject' as const}:key==='u'?{pickStatus:'unmarked' as const}:undefined
    if(changes){event.preventDefault();if(!blocked)void annotations.apply([asset.id],changes)}
  }}><Layout><LargeTitle title="灯箱比较" subtitle={`订单 #${orderId} · 两张原始照片`} action={<Button variant="plain" onClick={back}>← 返回图库</Button>}/>
    <div className="light-table-workspace"><label className="light-table-sync"><input type="checkbox" checked={synced} onChange={e=>{setSynced(e.target.checked);if(e.target.checked)setViews(previous=>[previous[focused],previous[focused]])}}/>同步缩放与平移</label><p className="asset-library-note">滚轮缩放，拖动/方向键平移，双击切换2倍/适应；焦点面板：F适应，＋/−缩放，0–5评分，P/X/U标记，Escape返回。同步按图像归一化中心映射。</p>
    <div className="light-table-panels">{results.map((result,index)=>result.isError?<ErrorState key={pair[index]} title={`${index?'B':'A'}：${imageErrorMessage(result.error)}`} onRetry={()=>{void result.refetch()}}/>:!result.data?<LoadingState key={pair[index]} label="正在核对照片归属"/>:index===1&&!firstSettled&&!results[0].isError?<LoadingState key={pair[index]} label="B 等待 A 预览完成"/>:<LightTablePanel key={pair[index]} asset={result.data as PhotoAsset} label={index?'B':'A'} view={views[index]} onView={view=>update(index,view)} onFocus={()=>setFocused(index)} onMetadata={annotations.apply} onEdit={()=>navigate(editorPath(orderId,pair[index],signature,pair))} blocked={blocked} autoFocus={index===0} onSettled={index===0?onFirstSettled:undefined} notice={annotations.busy?'正在保存标记…':annotations.issues.length?'标记未完成，请处理下方冲突或失败项。':undefined}/>)}</div>
    <p role="status">{annotations.progress}</p>{!!annotations.issues.length&&<div role="alert"><p>{annotations.issues.map(i=>`照片 #${i.id}：${i.message}`).join('；')}</p><Button disabled={annotations.busy} onClick={annotations.retry}>读取最新版本并重试失败项</Button><Button variant="plain" disabled={annotations.busy} onClick={annotations.dismiss}>保留服务器值</Button></div>}
    </div></Layout></div>
}
