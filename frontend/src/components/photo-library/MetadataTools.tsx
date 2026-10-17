import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { indexBatch, loadIndexStatus, loadMetadataFacets, loadTimeline, type IndexMode } from '@/api/metadataIndex'
import { imageErrorMessage } from '@/api/imageEdit'
import { Button } from '@/components/ui'
import { parseFilters, serializeFilters, type CatalogFilters } from '@/utils/catalogFilters'
import { deviceKeys, metadataKeys, serializeMetadata } from '@/utils/metadataFilters'
import './metadata-tools.css'
import { MetadataIssues } from './MetadataIssues'

const labels = {camera_make:'相机品牌',camera_model:'相机型号',lens_make:'镜头品牌',lens_model:'镜头型号'}

export function MetadataTools({userId,orderId,value,onChange,disabled}:{userId:number;orderId:number;value:CatalogFilters;onChange:(next:CatalogFilters)=>void;disabled:boolean}){
  const client=useQueryClient(),signature=serializeFilters(value)
  const status=useQuery({queryKey:['metadata-status',userId,orderId],queryFn:({signal})=>loadIndexStatus(orderId,signal),retry:false,refetchInterval:5000})
  const facets=useQuery({queryKey:['metadata-facets',userId,orderId],queryFn:({signal})=>loadMetadataFacets(orderId,signal),retry:false,staleTime:60000})
  const timeline=useQuery({queryKey:['metadata-timeline',userId,orderId,signature],queryFn:({signal})=>loadTimeline(orderId,value,signal),retry:false})
  const generation=useRef<string|undefined>(undefined)
  const revision=status.data?.generation
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined
    if(revision&&generation.current&&generation.current!==revision){
      timer=setTimeout(()=>{
        void client.resetQueries({predicate:q=>q.queryKey[0]==='photo-catalog'&&q.queryKey[1]===userId&&q.queryKey[2]===orderId&&typeof q.queryKey[3]==='string'&&!!parseFilters(new URLSearchParams(q.queryKey[3])).metadata})
        void client.invalidateQueries({queryKey:['metadata-facets',userId,orderId]})
        void client.invalidateQueries({queryKey:['metadata-timeline',userId,orderId]})
      },250)
    }
    generation.current=revision
    return()=>{if(timer!==undefined)clearTimeout(timer)}
  },[revision,client,userId,orderId])
  const [draft,setDraft]=useState(()=>Object.fromEntries(serializeMetadata(value.metadata))),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState('')
  const operation=useRef<AbortController|null>(null)
  useEffect(()=>()=>{operation.current?.abort()},[])
  const counts=status.data
  async function run(mode:IndexMode){
    if(operation.current)return
    const control=new AbortController();operation.current=control;setBusy(true);setError('');setProgress('正在索引，每批最多 10 张…')
    let cursor:string|null=null,processed=0
    try{
      do{
        const batch=await indexBatch(orderId,mode,cursor,control.signal)
        if(control.signal.aborted)break
        processed+=batch.results.length
        client.setQueryData(['metadata-status',userId,orderId],batch.counts)
        setProgress(`本轮已检查 ${processed} 张；已索引 ${batch.counts.indexed} / ${batch.counts.total}`)
        cursor=batch.next_cursor
        if(batch.results.some(r=>r.busy||r.status==='pending')){setProgress('有照片仍被其他请求处理，请稍后继续索引。');break}
      }while(cursor&&!control.signal.aborted)
    }catch(e){if(!control.signal.aborted)setError(imageErrorMessage(e))}
    finally{
      if(!control.signal.aborted){setBusy(false);operation.current=null;void status.refetch()}
    }
  }
  function stop(){operation.current?.abort();operation.current=null;setBusy(false);setProgress('已停止续批；当前服务端小批次仍会安全完成，刷新状态后可继续。');void status.refetch()}
  function apply(event:React.FormEvent){
    event.preventDefault()
    try{
      const search=new URLSearchParams(serializeFilters({...value,metadata:undefined}))
      for(const key of metadataKeys)if(draft[key])search.set(key,draft[key])
      onChange(parseFilters(search));setError('')
    }catch(e){setError(e instanceof Error?e.message:'筛选条件无效')}
  }
  function dateFilter(from?:string,to?:string,unknown=false){
    const metadata={...value.metadata};delete metadata.captured_from;delete metadata.captured_to;delete metadata.capture_unknown
    if(from&&to){metadata.captured_from=from;metadata.captured_to=to}
    if(unknown)metadata.capture_unknown=true
    try{onChange(parseFilters(new URLSearchParams(serializeFilters({...value,metadata}))))}catch(e){setError(e instanceof Error?e.message:'日期筛选无效')}
  }
  return <section aria-label="拍摄元数据索引与筛选" className="asset-metadata-tools">
    <h2>拍摄信息与时间线</h2>
    {status.isPending?<p role="status">正在读取索引状态…</p>:status.isError?<p role="alert">索引状态读取失败。<Button variant="plain" onClick={()=>{void status.refetch()}}>重试索引状态</Button></p>:counts&&<p>共 {counts.total} 张 · 已索引 {counts.indexed} · 待处理 {counts.pending}（未索引 {counts.unindexed}）· 失败 {counts.failed} · 不支持 {counts.unsupported}</p>}
    {counts&&(counts.indexed<counts.total)&&<p role="note">索引尚未完整：拍摄条件和时间线只包含已索引的匹配照片；未索引、失败或不支持的照片仍可在原图库浏览。</p>}
    <div className="asset-metadata-actions">
      <Button variant="gray" disabled={disabled||busy||status.isPending} onClick={()=>{void run('missing')}}>开始 / 继续索引</Button>
      <Button variant="plain" disabled={disabled||busy||!counts||!(counts.failed+counts.unsupported)} onClick={()=>{void run('retry')}}>重试失败项</Button>
      <Button variant="plain" disabled={disabled||busy} onClick={()=>{void run('refresh')}}>校验并刷新全部</Button>
      {busy&&<Button variant="plain" onClick={stop}>停止续批</Button>}
    </div>
    <p role="status" aria-live="polite">{progress}</p>
    <p className="asset-library-note">索引由此页面逐批推进；关闭页面不会留下自动任务。原图变化后请使用“校验并刷新全部”。</p>
    <form aria-label="拍摄条件" onSubmit={apply}>
      <fieldset disabled={disabled||busy} className="asset-metadata-inputs">
        {deviceKeys.map(key=><label key={key}>{labels[key]}<select aria-label={labels[key]} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})}><option value="">所有{labels[key]}</option>{draft[key]&&!facets.data?.[key].some(v=>v.value===draft[key])&&<option value={draft[key]}>当前条件：{draft[key]}</option>}{facets.data?.[key].map(v=><option key={v.value} value={v.value}>{v.value}（{v.count}）</option>)}</select></label>)}
        {(['iso','focal','aperture'] as const).map((name)=><div key={name} className="asset-metadata-range">{name==='iso'?'ISO':name==='focal'?'焦距（mm）':'光圈（f）'}{(['min','max'] as const).map(side=><label key={side}>{side==='min'?'最小':'最大'}<input aria-label={`${name} ${side}`} type="number" min={name==='iso'?1:.1} max={name==='iso'?10000000:name==='focal'?100000:1024} step={name==='iso'?1:'any'} value={draft[`${name}_${side}`]??''} onChange={e=>setDraft({...draft,[`${name}_${side}`]:e.target.value})}/></label>)}</div>)}
        <label>拍摄起日<input aria-label="拍摄起日" type="date" value={draft.captured_from??''} onChange={e=>setDraft({...draft,captured_from:e.target.value,capture_unknown:''})}/></label>
        <label>拍摄止日<input aria-label="拍摄止日" type="date" value={draft.captured_to??''} onChange={e=>setDraft({...draft,captured_to:e.target.value,capture_unknown:''})}/></label>
        <label>索引状态<select aria-label="索引状态" value={draft.metadata_status??''} onChange={e=>setDraft({...draft,metadata_status:e.target.value})}><option value="">全部状态</option><option value="indexed">已索引</option><option value="pending">待处理（含未索引）</option><option value="failed">失败</option><option value="unsupported">不支持</option></select></label>
      </fieldset>
      <Button variant="gray" type="submit" disabled={disabled||busy}>应用拍摄条件</Button>
      <Button variant="plain" type="button" disabled={disabled||busy} onClick={()=>{setDraft({});setError('');onChange({...value,metadata:undefined})}}>清除拍摄条件</Button>
    </form>
    {facets.isError&&<p role="alert">设备选项读取失败。<Button variant="plain" onClick={()=>{void facets.refetch()}}>重试设备选项</Button></p>}
    {facets.data?.truncated&&<p>设备选项每类仅列出前 50 项；未展示完整设备列表。</p>}
    {error&&<p role="alert">{error}</p>}
    <section aria-label="拍摄时间线" className="asset-capture-timeline">
      <h3>拍摄时间线 · {timeline.data?.level==='day'?'日':timeline.data?.level==='month'?'月':'年'}</h3>
      <p className="asset-library-note">按原始拍摄地日期分组，不转换浏览器时区；日期未知不是上传日期。</p>
      <Button variant="plain" disabled={disabled||busy} onClick={()=>dateFilter()}>所有年份 / 清除日期</Button>
      {timeline.isPending?<p role="status">正在读取时间线…</p>:timeline.isError?<p role="alert">时间线读取失败。<Button variant="plain" onClick={()=>{void timeline.refetch()}}>重试时间线</Button></p>:<>
        {timeline.data?.buckets.map(bucket=><Button key={bucket.date} variant="plain" disabled={disabled||busy} onClick={()=>dateFilter(bucket.captured_from,bucket.captured_to)}>{bucket.date}（{bucket.count}）</Button>)}
        <Button variant="plain" disabled={disabled||busy} onClick={()=>dateFilter(undefined,undefined,true)}>拍摄日期未知（{timeline.data?.unknown??0}）</Button>
        {timeline.data?.truncated&&<p>最多显示 200 个年份，请使用日期范围缩小查询。</p>}
      </>}
    </section>
    <MetadataIssues userId={userId} orderId={orderId} disabled={disabled||busy} generation={revision}/>
  </section>
}
