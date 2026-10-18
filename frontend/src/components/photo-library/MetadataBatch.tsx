import {useEffect,useRef,useState} from 'react'
import {batchOverlay,overlayRevisions,keywordInput,type BatchOperation} from '@/api/metadataOverlay'
import {Button} from '@/components/ui'
import {metadataErrorMessage as imageErrorMessage} from '@/api/metadataOverlay'
import './descriptive-metadata.css'

export function MetadataBatch({ids,disabled,onSaved}:{ids:number[];disabled:boolean;onSaved:()=>void}){
  const [kind,setKind]=useState('keywords_add'),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[failures,setFailures]=useState<number[]>([]),[error,setError]=useState('')
  const retry=useRef<{ids:number[];operation:BatchOperation}|null>(null),active=useRef(false),controller=useRef<AbortController|null>(null),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort()}},[])
  async function apply(selected:number[],operation:BatchOperation){
    if(active.current||!selected.length)return
    active.current=true;setBusy(true);setError('');setFailures([]);setProgress(`准备更新 ${selected.length} 张`)
    const abort=new AbortController();controller.current=abort;let done=0;const failed:number[]=[]
    try{
      for(let offset=0;offset<selected.length;offset+=10){
        if(abort.signal.aborted)break
        const chunk=selected.slice(offset,offset+10)
        try{
          const revisions=await overlayRevisions(chunk,abort.signal)
          if(abort.signal.aborted)break
          const results=await batchOverlay(revisions,operation,abort.signal)
          done+=results.filter(r=>r.status==='success').length
          failed.push(...results.filter(r=>r.status==='conflict').map(r=>r.photoId))
        }catch(e){if(abort.signal.aborted)break;failed.push(...selected.slice(offset));setError(imageErrorMessage(e));break}
        if(alive.current)setProgress(`已成功 ${done} / ${selected.length} 张`)
      }
      if(alive.current&&!abort.signal.aborted){setFailures(failed);retry.current=failed.length?{ids:failed,operation}:null;setProgress(`成功 ${done} 张，需处理 ${failed.length} 张`);onSaved()}
    }finally{active.current=false;if(alive.current)setBusy(false)}
  }
  function submit(){
    try{let operation:BatchOperation
      if(kind==='creator'||kind==='copyright'){if(!value.trim())throw Error('请输入共享描述值');operation={type:'fields',fields:{[kind]:{mode:'override',value}}}}
      else if(kind==='keywords_clear'||kind==='keywords_inherit')operation={type:kind}
      else operation={type:kind as 'keywords_add'|'keywords_remove'|'keywords_replace',keywords:keywordInput(value)}
      void apply(ids,operation)
    }catch(e){setError(e instanceof Error?e.message:'输入无效')}
  }
  return <section aria-label="批量描述元数据"><div className="metadata-batch">
    <label>批量描述操作<select aria-label="批量描述操作" value={kind} disabled={busy||disabled} onChange={e=>setKind(e.target.value)}><option value="keywords_add">添加关键词</option><option value="keywords_remove">移除关键词</option><option value="keywords_replace">替换关键词</option><option value="keywords_clear">清空关键词</option><option value="keywords_inherit">继承原始关键词</option><option value="creator">设置共享作者</option><option value="copyright">设置共享版权</option></select></label>
    {!['keywords_clear','keywords_inherit'].includes(kind)&&<label>批量描述值（关键词每行一个）<textarea aria-label="批量描述值" rows={2} maxLength={kind==='creator'?512:kind==='copyright'?1024:8256} value={value} disabled={busy||disabled} onChange={e=>setValue(e.target.value)}/></label>}
    <Button disabled={busy||disabled||!ids.length} onClick={submit}>{busy?'正在批量保存…':`应用到已选 ${ids.length} 张`}</Button></div>
    <p role="status">{progress}</p>{error&&<p role="alert">{error}</p>}
    {!!failures.length&&<div role="alert"><p>未完成照片：{failures.slice(0,20).join('、')}{failures.length>20?'…':''}。成功项已保存；失败项不会自动重放。</p><Button disabled={busy} onClick={()=>{const intent=retry.current;if(intent&&window.confirm('将读取失败照片的最新版本，并重新应用这次批量操作，继续吗？'))void apply(intent.ids,intent.operation)}}>确认后读取最新版本并重试失败项</Button></div>}
  </section>
}
