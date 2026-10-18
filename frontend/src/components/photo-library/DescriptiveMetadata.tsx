import {useCallback,useEffect,useRef,useState} from 'react'
import axios from 'axios'
import {Button,ErrorState,LoadingState} from '@/components/ui'
import {descriptiveNames,loadEffective,writeOverlay,resetOverlay,downloadSidecar,effectiveMetadata,limits,keywordInput,validateFields,type EffectiveMetadata,type DescriptiveName,type OverlayFields,type Mode} from '@/api/metadataOverlay'
import {metadataErrorMessage as imageErrorMessage} from '@/api/metadataOverlay'
import {saveBlob} from '@/utils/download'
import './descriptive-metadata.css'

const names={title:'标题',caption:'说明',creator:'作者',copyright:'版权',keywords:'关键词'}
const modes={inherit:'继承原始文件',override:'使用 LensFlow 编辑值',clear:'清空有效值'}
export function DescriptiveMetadata({photoId,onDirty,onSaved}:{photoId:number;onDirty?:(value:boolean)=>void;onSaved?:()=>void}){
  const [open,setOpen]=useState(false)
  const dirty=useRef(false),changed=useCallback((value:boolean)=>{dirty.current=value;onDirty?.(value)},[onDirty])
  return <section className="descriptive-metadata"><Button variant="plain" size="sm" aria-expanded={open} onClick={()=>{if(!open||!dirty.current||window.confirm('收起面板将放弃未保存的描述修改，继续吗？'))setOpen(v=>!v)}}>描述元数据与 XMP</Button>
    {open&&<MetadataForm key={photoId} photoId={photoId} onDirty={changed} onSaved={onSaved}/>}</section>
}

export function MetadataForm({photoId,onDirty,onSaved}:{photoId:number;onDirty?:(value:boolean)=>void;onSaved?:()=>void}){
  const [server,setServer]=useState<EffectiveMetadata|null>(null),[fields,setFields]=useState<OverlayFields|null>(null),[conflict,setConflict]=useState<EffectiveMetadata|null>(null)
  const [texts,setTexts]=useState<Record<DescriptiveName,string>>({title:'',caption:'',creator:'',copyright:'',keywords:''})
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[notice,setNotice]=useState('')
  const controller=useRef<AbortController|null>(null),alive=useRef(true),dirty=!!server&&!!fields&&descriptiveNames.some(n=>fields[n].mode!==server.fields[n].mode||(fields[n].mode==='override'&&texts[n]!==display(server.fields[n].mode==='override'?server.fields[n].value:server.effective[n])))
  function display(v:string|string[]|null){return Array.isArray(v)?v.join('\n'):v??''}
  function accept(data:EffectiveMetadata){setServer(data);setFields(data.fields);setTexts(Object.fromEntries(descriptiveNames.map(n=>[n,display(data.fields[n].mode==='override'?data.fields[n].value:data.effective[n])])) as Record<DescriptiveName,string>);setConflict(null);setError('')}
  useEffect(()=>{alive.current=true;const abort=new AbortController();controller.current=abort
    loadEffective(photoId,abort.signal).then(data=>{if(!abort.signal.aborted)accept(data)}).catch(e=>{if(!abort.signal.aborted)setError(imageErrorMessage(e))})
    return()=>{alive.current=false;abort.abort();controller.current?.abort()}
  },[photoId,attempt])
  useEffect(()=>{onDirty?.(dirty);return()=>onDirty?.(false)},[dirty,onDirty])
  useEffect(()=>{
    if(!dirty)return
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)
  },[dirty])
  function draft(){if(!fields)throw Error('尚未加载');return validateFields(Object.fromEntries(descriptiveNames.map(n=>[n,fields[n].mode==='override'?{mode:'override',value:n==='keywords'?keywordInput(texts[n]):texts[n]}:{mode:fields[n].mode}])))}
  async function save(reset=false,reapply=false){
    if(!server||busy)return
    setBusy(true);setError('');setNotice('');const abort=new AbortController();controller.current=abort
    try{
      const revision=reapply&&conflict?conflict.revision:server.revision
      const result=reset?await resetOverlay(photoId,revision,abort.signal):await writeOverlay(photoId,revision,draft(),abort.signal)
      if(alive.current&&!abort.signal.aborted){accept(result);setNotice(reset?'已恢复继承原始文件':'描述元数据已保存，原图保持不变');onSaved?.()}
    }catch(e){if(alive.current&&!abort.signal.aborted){
      if(axios.isAxiosError(e)&&e.response?.status===409){try{setConflict(effectiveMetadata(e.response.data.current,photoId));setError('发生版本冲突。你的文本已保留，请核对服务器值。')}catch{setError('冲突响应无效，请保留文本并重新读取')}}
      else setError(imageErrorMessage(e))
    }}finally{if(alive.current&&!abort.signal.aborted)setBusy(false)}
  }
  async function download(){if(busy)return;setBusy(true);setError('');const abort=new AbortController();controller.current=abort
    try{const blob=await downloadSidecar(photoId,abort.signal);if(alive.current&&!abort.signal.aborted){saveBlob(blob,`photo-${photoId}.xmp`);setNotice('已下载服务器已保存的描述元数据 XMP')}}catch(e){if(alive.current&&!abort.signal.aborted)setError(imageErrorMessage(e))}finally{if(alive.current&&!abort.signal.aborted)setBusy(false)}}
  if(!server||!fields)return error?<ErrorState title={error} onRetry={()=>{setError('');setAttempt(n=>n+1)}}/>:<LoadingState label="正在读取描述元数据"/>
  return <form aria-label="描述元数据编辑" onSubmit={e=>{e.preventDefault();void save()}}>
    <p className="asset-library-note">非破坏性编辑 · 版本 {server.revision} · {dirty?'有未保存修改':'已同步'}。原始文件只读；XMP 导出已保存值。</p>
    {server.source_changed&&<p role="alert">原始文件指纹发生变化；LensFlow 编辑值已保留。请检查继承字段后再保存。</p>}
    <fieldset disabled={busy}>
      {descriptiveNames.map(n=><div className="descriptive-field" key={n}>
        <label>{names[n]}模式<select aria-label={`${names[n]}模式`} value={fields[n].mode} onChange={e=>{const mode=e.target.value as Mode;setFields({...fields,[n]:mode==='override'?{mode,value:n==='keywords'?[]:texts[n]}:{mode}})}}>{Object.entries(modes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>{names[n]}{n==='keywords'?'（每行一个）':''}{n==='caption'||n==='keywords'?<textarea aria-label={names[n]} rows={n==='caption'?4:3} disabled={fields[n].mode!=='override'} maxLength={n==='keywords'?8256:limits[n]} value={texts[n]} onChange={e=>setTexts({...texts,[n]:e.target.value})}/>:<input aria-label={names[n]} disabled={fields[n].mode!=='override'} maxLength={limits[n]} value={texts[n]} onChange={e=>setTexts({...texts,[n]:e.target.value})}/>}</label>
        <span className="asset-library-note">有效值：{display(server.effective[n])||'空白'} · 来源：{server.provenance[n].source}</span>
        <details><summary>原始{names[n]}（只读）</summary><p className="descriptive-original">{display(server.original[n])||'未记录'}</p></details>
      </div>)}
    </fieldset>
    {error&&<p role="alert">{error}</p>}
    {conflict&&<section aria-label="服务器描述元数据"><strong>服务器版本 {conflict.revision}</strong><dl>{descriptiveNames.map(n=><div key={n}><dt>{names[n]} · {modes[conflict.fields[n].mode]}</dt><dd>{display(conflict.effective[n])||'空白'}</dd></div>)}</dl>
      <Button type="button" disabled={busy} onClick={()=>accept(conflict)}>放弃本地修改并载入服务器值</Button><Button type="button" disabled={busy} onClick={()=>{void save(false,true)}}>确认以我的完整草稿重新提交</Button></section>}
    {notice&&<p role="status">{notice}</p>}
    <div className="descriptive-actions"><Button type="submit" disabled={busy||!dirty||!!conflict}>{busy?'处理中…':'保存描述元数据'}</Button><Button type="button" variant="plain" disabled={busy||!!conflict} onClick={()=>{if(!dirty||window.confirm('重置会放弃未保存的描述修改，继续吗？'))void save(true)}}>恢复全部继承</Button><Button type="button" variant="plain" disabled={busy||dirty} onClick={()=>{void download()}}>下载 XMP Sidecar</Button></div>
    {server.warnings.length>0&&<p className="asset-library-note">来源包含 {server.warnings.length} 项解析或来源提示；原始信息可能不完整。</p>}
  </form>
}
