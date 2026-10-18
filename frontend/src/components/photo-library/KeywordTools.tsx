import {useEffect,useRef,useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {keywordStatus,rebuildKeywords} from '@/api/metadataOverlay'
import {Button} from '@/components/ui'
import {metadataErrorMessage as imageErrorMessage} from '@/api/metadataOverlay'
import type {CatalogFilters} from '@/utils/catalogFilters'
import './descriptive-metadata.css'

export function KeywordTools({userId,orderId,value,onChange,disabled}:{userId:number;orderId:number;value:CatalogFilters;onChange:(next:CatalogFilters)=>void;disabled:boolean}){
  const [text,setText]=useState((value.keywords??[]).join('\n')),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('')
  const client=useQueryClient(),controller=useRef<AbortController|null>(null),active=useRef(false),resume=useRef(0)
  const status=useQuery({queryKey:['keyword-status',userId,orderId],queryFn:({signal})=>keywordStatus(orderId,signal),staleTime:30000})
  useEffect(()=>()=>controller.current?.abort(),[])
  async function rebuild(){
    if(active.current)return;active.current=true;setBusy(true);setError('')
    const abort=new AbortController();controller.current=abort
    try{
      for(let i=0;i<100;i++){
        const result=await rebuildKeywords(orderId,resume.current,abort.signal)
        if(abort.signal.aborted)return
        client.setQueryData(['keyword-status',userId,orderId],result.coverage)
        setProgress(`关键词索引已就绪 ${result.coverage.indexed} / ${result.coverage.total}`)
        if(result.failed)setError('部分原图无法读取或不支持，已跳过并标记为未就绪；请检查原始文件后重建。')
        resume.current=result.hasMore?result.nextAfterId!:0
        if(!result.hasMore)break
      }
      await client.resetQueries({predicate:q=>q.queryKey[0]==='photo-catalog'&&q.queryKey[1]===userId&&q.queryKey[2]===orderId&&typeof q.queryKey[3]==='string'&&new URLSearchParams(q.queryKey[3]).has('keywords')})
    }catch(e){if(!abort.signal.aborted)setError(imageErrorMessage(e))}finally{if(controller.current===abort){active.current=false;if(!abort.signal.aborted)setBusy(false)}}
  }
  return <section aria-label="关键词检索与索引"><form className="keyword-filter" onSubmit={e=>{e.preventDefault();try{const list=text.split(/\r?\n/).map(v=>v.normalize('NFC').trim()).filter(Boolean);if(list.length>10||list.some(v=>v.length>128||/[\p{Cc}\p{Cs}]/u.test(v)))throw Error('最多 10 个关键词，每个最多 128 字符');onChange({...value,keywords:list.length?list:undefined})}catch(e){setError(e instanceof Error?e.message:'关键词无效')}}}>
    <label>检索关键词（每行一个，全部匹配）<textarea aria-label="检索关键词" rows={2} maxLength={1290} value={text} onChange={e=>setText(e.target.value)} disabled={disabled||busy}/></label><Button type="submit" disabled={disabled||busy}>应用关键词筛选</Button>
    <Button type="button" variant="plain" disabled={disabled||busy} onClick={()=>{void rebuild()}}>重建关键词索引</Button>{busy&&<Button type="button" variant="plain" onClick={()=>{controller.current?.abort();active.current=false;setBusy(false);setProgress('已暂停；再次点击重建可继续')}}>暂停重建</Button>}</form>
    {status.data&&<p className="asset-library-note">关键词已索引 {status.data.indexed} / {status.data.total}{status.data.unknown>0?`；${status.data.unknown} 张尚未就绪，筛选结果不完整。`:''} 来源仅在建立索引时核实；外部文件变更后请重建。</p>}
    {status.isError&&<p role="alert">{imageErrorMessage(status.error)}<Button variant="plain" onClick={()=>{void status.refetch()}}>重试索引状态</Button></p>}
    <p role="status">{progress}</p>{error&&<p role="alert">{error}</p>}
  </section>
}
