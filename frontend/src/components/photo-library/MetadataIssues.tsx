import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui'
import { loadMetadataIssues, loadMetadataWarningDetails, retryMetadataIssue, indexErrorMessages, type MetadataIssue, type MetadataWarningDetails } from '@/api/metadataIndex'

type RowState={message?:string;error?:string;warnings?:MetadataWarningDetails}
const stateNames={pending:'待处理',indexed:'已索引（含警告）',failed:'失败',unsupported:'不支持'}
const identityNames={current_parser:'当前解析器',stale_parser:'旧解析器，需要重建',unindexed:'尚未建立索引'}
function diagnosticError(error:unknown){
  const status=(error as {response?:{status?:number}})?.response?.status
  if(status===401)return '登录已失效，请重新登录。'
  if(status===403)return '没有权限读取或重试此订单的索引。'
  if(status===404)return '照片或原始文件不存在，请检查后重试。'
  if(status===429)return '元数据读取繁忙，请稍后重试。'
  if(status===503)return '索引服务暂不可用，请稍后重试。'
  return '诊断操作未完成，请重试。'
}

function IssueSession({userId,orderId,disabled,generation}:{userId:number;orderId:number;disabled:boolean;generation?:string}){
  const client=useQueryClient(),[open,setOpen]=useState(false),[category,setCategory]=useState('failed,unsupported,warnings')
  const key=['metadata-issues',userId,orderId,category] as const
  const query=useInfiniteQuery({queryKey:key,queryFn:({pageParam,signal})=>loadMetadataIssues(orderId,category,pageParam,signal),initialPageParam:null as string|null,
    getNextPageParam:page=>page.next_cursor??undefined,enabled:open,retry:false,refetchOnWindowFocus:false})
  const [rows,setRows]=useState<Record<number,RowState>>({}),[active,setActive]=useState<{id:number;kind:'retry'|'warnings'}|null>(null),[notice,setNotice]=useState('')
  const operation=useRef<AbortController|null>(null),previousGeneration=useRef(generation)
  useEffect(()=>()=>{operation.current?.abort()},[])
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined
    if(previousGeneration.current!==generation&&previousGeneration.current!==undefined){
      timer=setTimeout(()=>{void client.resetQueries({queryKey:['metadata-issues',userId,orderId]})},250)
    }
    previousGeneration.current=generation
    return()=>{if(timer!==undefined)clearTimeout(timer)}
  },[generation,client,userId,orderId])
  function rowState(id:number,next:RowState){setRows(current=>({...current,[id]:next}))}
  async function inspect(item:MetadataIssue,kind:'retry'|'warnings'){
    if(operation.current)return
    const control=new AbortController();operation.current=control;setActive({id:item.photo_id,kind});setNotice('');rowState(item.photo_id,{})
    try{
      if(kind==='warnings'){
        const warnings=await loadMetadataWarningDetails(item.photo_id,control.signal)
        if(!control.signal.aborted)rowState(item.photo_id,{warnings})
      }else{
        const result=await retryMetadataIssue(item.photo_id,control.signal)
        if(control.signal.aborted)return
        const message=result.busy||result.status==='pending'?'仍在等待处理，可稍后继续。':result.status==='indexed'?'索引已完成。':`重试未成功：${indexErrorMessages[result.error_code??'UNKNOWN']??indexErrorMessages.UNKNOWN}`
        rowState(item.photo_id,result.status==='failed'||result.status==='unsupported'?{error:message}:{message})
        setNotice(`照片 #${item.photo_id}：${message}`)
        void client.invalidateQueries({queryKey:['metadata-status',userId,orderId]})
        void client.resetQueries({queryKey:['metadata-issues',userId,orderId]})
      }
    }catch(error){
      if(!control.signal.aborted)rowState(item.photo_id,{error:diagnosticError(error)})
    }finally{
      if(!control.signal.aborted){operation.current=null;setActive(null)}
    }
  }
  const items=query.data?.pages.flatMap(page=>page.items)??[]
  return <section aria-label="索引诊断" className="asset-index-issues">
    <h3><Button variant="plain" type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>索引诊断{open?' · 收起':' · 展开'}</Button></h3>
    {open&&<>
      <p className="asset-library-note">列表仅查询已存索引，不读取原图，也未验证原文件指纹。解析器版本一致不代表原图当前未变更。</p>
      <label>诊断类别<select aria-label="诊断类别" value={category} disabled={!!active} onChange={event=>{setCategory(event.target.value);setRows({});setNotice('')}}>
        <option value="failed,unsupported,warnings">失败、不支持和警告</option><option value="failed">失败</option><option value="unsupported">不支持</option><option value="warnings">元数据警告</option><option value="pending">待处理（含未索引与旧版本）</option>
      </select></label>
      <Button variant="plain" type="button" disabled={query.isFetching||!!active} onClick={()=>{void client.resetQueries({queryKey:key,exact:true})}}>刷新诊断</Button>
      {query.isPending?<p role="status">正在读取索引诊断…</p>:query.isError&&!items.length?<div role="alert">无法读取索引诊断。<Button variant="plain" type="button" onClick={()=>{void query.refetch()}}>重试诊断列表</Button></div>:!items.length?<p>当前类别暂无诊断项。</p>:<ul className="asset-index-issue-list">
        {items.map(item=><li key={item.photo_id} aria-label={`照片 ${item.photo_id} 索引诊断`}>
          <div className="asset-index-issue-summary"><strong>{item.filename}</strong><span>#{item.photo_id} · {stateNames[item.index_status]} · {identityNames[item.identity_state]}</span></div>
          <p>{item.error_code?(indexErrorMessages[item.error_code]??indexErrorMessages.UNKNOWN):item.index_status==='pending'?'等待处理；续批或显式重试后才会推进。':'索引包含可安全读取的元数据。'} · 警告 {item.warning_count} 项</p>
          <p className="asset-library-note">索引时间：{item.indexed_at?new Date(item.indexed_at).toLocaleString():'尚未完成'} · 原图指纹未核验</p>
          <Button variant="plain" type="button" disabled={disabled||!!active||!item.retryable} onClick={()=>{void inspect(item,'retry')}}>{active?.id===item.photo_id&&active.kind==='retry'?'正在重试…':item.index_status==='indexed'?'重新索引此项':'重试此项'}</Button>
          {!item.retryable&&<span className="asset-library-note">当前不可直接重试；请先解决格式、文件限制或等待活跃处理结束。</span>}
          {item.warning_count>0&&<Button variant="plain" type="button" disabled={disabled||!!active} onClick={()=>{void inspect(item,'warnings')}}>{active?.id===item.photo_id&&active.kind==='warnings'?'正在读取警告…':'读取详细警告'}</Button>}
          {rows[item.photo_id]?.error&&<p role="alert">{rows[item.photo_id].error}</p>}
          {rows[item.photo_id]?.message&&<p role="status">{rows[item.photo_id].message}</p>}
          {rows[item.photo_id]?.warnings&&<div aria-label={`照片 ${item.photo_id} 详细警告`}>
            <p className="asset-library-note">以下为本次显式读取原图的安全解析代码；与索引计数可能不同，不会写入原图。</p>
            <ul>{rows[item.photo_id].warnings!.warnings.map(code=><li key={code}><code>{code}</code></li>)}</ul>
            {rows[item.photo_id].warnings!.unrecognized_count>0&&<p>另有 {rows[item.photo_id].warnings!.unrecognized_count} 项未识别警告，未展示原文。</p>}
            {!rows[item.photo_id].warnings!.warnings.length&&!rows[item.photo_id].warnings!.unrecognized_count&&<p>此次读取未返回警告。</p>}
          </div>}
        </li>)}
      </ul>}
      {query.isFetchNextPageError&&<p role="alert">下一页诊断加载失败，已显示项仍可操作。</p>}
      {query.hasNextPage&&<Button type="button" variant="plain" disabled={query.isFetching||!!active} onClick={()=>{void query.fetchNextPage({cancelRefetch:false})}}>{query.isFetchingNextPage?'正在读取下一页…':query.isFetchNextPageError?'重试下一页诊断':'加载更多诊断'}</Button>}
      <p role="status" aria-live="polite">{notice}</p>
      <p className="asset-library-note">重试由当前页面请求触发。关闭页面会停止后续请求；当前服务端单项可能完成，重新打开后可读取状态并继续。</p>
    </>}
  </section>
}

/** Session boundary prevents a previous order's responses or local retry messages entering another order. */
export function MetadataIssues(props:{userId:number;orderId:number;disabled:boolean;generation?:string}){
  return <IssueSession key={`${props.userId}:${props.orderId}`} {...props}/>
}
