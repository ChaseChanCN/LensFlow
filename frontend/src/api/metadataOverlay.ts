import client from './client'
import {isAxiosError} from 'axios'
export function metadataErrorMessage(error:unknown){
  if(!isAxiosError(error))return error instanceof Error?error.message:'描述元数据操作失败，请重试'
  const code=error.response?.data?.code
  if(code==='SCHEMA_NOT_READY')return '描述元数据数据库尚未迁移，请联系管理员完成迁移后重试'
  const messages:Record<number,string>={401:'登录已失效，请重新登录',403:'仅照片所属摄影师可访问描述元数据',404:'照片或原始文件不存在，无法计算继承值',409:'描述元数据版本发生冲突，请核对服务器值',413:'元数据或原图读取超过预算，请减少批量照片或关键词数量',415:'原图格式不支持元数据读取',422:'描述字段、模式或关键词无效，请检查输入',429:'元数据读取服务忙，请稍后重试',503:'元数据数据库或存储暂不可用，请稍后重试'}
  return messages[error.response?.status??0]??(error.response?'描述元数据操作失败，请重试':'网络连接失败；草稿已保留，请检查连接后重试')
}
export const descriptiveNames=['title','caption','creator','copyright','keywords'] as const
export type DescriptiveName=typeof descriptiveNames[number]
export type Mode='inherit'|'override'|'clear'
export type FieldState={mode:'inherit'|'clear';value?:never}|{mode:'override';value:string|string[]}
export type OverlayFields=Record<DescriptiveName,FieldState>
export type Description=Record<Exclude<DescriptiveName,'keywords'>,string|null>&{keywords:string[]}
export interface EffectiveMetadata {photo_id:number;revision:number;source_sha256:string;source_status:'verified_at_read';source_changed:boolean;fields:OverlayFields;original:Description;effective:Description;provenance:Record<DescriptiveName,{mode:Mode;source:string}>;warnings:string[]}
export const limits={title:512,caption:8192,creator:512,copyright:1024,keywords:128}
export const inheritedFields=():OverlayFields=>Object.fromEntries(descriptiveNames.map(n=>[n,{mode:'inherit'}])) as OverlayFields
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('描述元数据响应无效');return value as Record<string,unknown>}
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const unsafeText=(value:string)=>Array.from(value).some(c=>(/[\p{Cc}\p{Cs}]/u.test(c)&&c!=='\n'&&c!=='\t')||c.codePointAt(0)===65534||c.codePointAt(0)===65535)
export function keywordInput(value:string):string[]{
  const list=value.split(/\r?\n/).map(v=>v.normalize('NFC').trim()).filter(Boolean)
  if(list.length>64||list.some(v=>v.length>128||/[\p{Cc}\p{Cs}]/u.test(v)))throw Error('关键词最多 64 个，每个 1–128 字符；每行一个')
  return list
}
function description(value:unknown):Description{
  const data=object(value)
  for(const n of descriptiveNames){const v=data[n];if(n==='keywords'){if(!Array.isArray(v)||v.length>64||v.some(k=>typeof k!=='string'||k.length<1||k.length>128))throw Error('关键词响应无效')}
    else if(v!==null&&(typeof v!=='string'||v.length>limits[n]))throw Error('描述文本响应无效')}
  return Object.fromEntries(descriptiveNames.map(n=>[n,data[n]])) as Description
}
export function validateFields(value:unknown):OverlayFields{
  const data=object(value),result=inheritedFields()
  if(Object.keys(data).length!==5)throw Error('必须包含全部描述字段')
  for(const n of descriptiveNames){const v=object(data[n]);if(!['inherit','override','clear'].includes(String(v.mode))||Object.keys(v).some(k=>!['mode','value'].includes(k)))throw Error('描述模式无效')
    if(v.mode!=='override'){if(v.value!==undefined&&v.value!==null)throw Error('继承和清空不能携带值');result[n]={mode:v.mode as 'inherit'|'clear'}}
    else {if(n==='keywords'){if(!Array.isArray(v.value)||v.value.length>64||v.value.some(k=>typeof k!=='string'||!k.trim()||k.length>128||/[\p{Cc}\p{Cs}]/u.test(k)))throw Error('关键词无效')}
      else if(typeof v.value!=='string'||!v.value.trim()||v.value.length>limits[n]||unsafeText(v.value))throw Error('描述文本无效')
      result[n]={mode:'override',value:v.value as string|string[]}}
  }return result
}
export function effectiveMetadata(value:unknown,id:number):EffectiveMetadata{
  const v=object(value)
  if(v.photo_id!==id||!integer(v.revision)||typeof v.source_sha256!=='string'||! /^[a-f0-9]{64}$/.test(v.source_sha256)||v.source_status!=='verified_at_read'||typeof v.source_changed!=='boolean'||!Array.isArray(v.warnings)||v.warnings.some(w=>typeof w!=='string'))throw Error('描述元数据身份或版本无效')
  const fields=validateFields(v.fields),provenance=object(v.provenance)
  for(const n of descriptiveNames){const p=object(provenance[n]);if(p.mode!==fields[n].mode||typeof p.source!=='string')throw Error('元数据来源无效')}
  return {photo_id:id,revision:v.revision as number,source_sha256:v.source_sha256,source_status:v.source_status,source_changed:v.source_changed,fields,original:description(v.original),effective:description(v.effective),provenance:provenance as EffectiveMetadata['provenance'],warnings:v.warnings as string[]}
}
export async function loadEffective(id:number,signal?:AbortSignal){return effectiveMetadata((await client.get(`/api/v1/photos/${id}/metadata-effective`,{signal})).data,id)}
export async function writeOverlay(id:number,revision:number,fields:OverlayFields,signal?:AbortSignal){return effectiveMetadata((await client.put(`/api/v1/photos/${id}/metadata-overlay`,{expected_revision:revision,fields:validateFields(fields)},{signal})).data,id)}
export async function resetOverlay(id:number,revision:number,signal?:AbortSignal){return effectiveMetadata((await client.delete(`/api/v1/photos/${id}/metadata-overlay`,{data:{expected_revision:revision},signal})).data,id)}
export async function downloadSidecar(id:number,signal?:AbortSignal){const {data}=await client.get<Blob>(`/api/v1/photos/${id}/metadata-sidecar.xmp`,{responseType:'blob',signal});if(!(data instanceof Blob)||!data.size||data.size>131072)throw Error('XMP 下载响应无效');return data}
export type BatchOperation={type:'keywords_add'|'keywords_remove'|'keywords_replace';keywords:string[]}|{type:'keywords_clear'|'keywords_inherit'}|{type:'fields';fields:Partial<Record<Exclude<DescriptiveName,'keywords'>,FieldState>>}
export async function overlayRevisions(ids:number[],signal?:AbortSignal){
  const {data}=await client.post('/api/v1/photos/metadata-overlays/revisions',{photo_ids:ids},{signal})
  if(!Array.isArray(data.items)||data.items.length!==ids.length||data.items.some((v:{photo_id:number;revision:number},i:number)=>v.photo_id!==ids[i]||!integer(v.revision)))throw Error('元数据版本响应无效')
  return data.items as {photo_id:number;revision:number}[]
}
export async function batchOverlay(items:{photo_id:number;revision:number}[],operation:BatchOperation,signal?:AbortSignal):Promise<{photoId:number;status:'success'|'conflict';metadata:EffectiveMetadata}[]>{
  const {data}=await client.post('/api/v1/photos/metadata-overlays/batch',{items:items.map(v=>({photo_id:v.photo_id,expected_revision:v.revision})),operation},{signal})
  if(!Array.isArray(data.results)||data.results.length!==items.length)throw Error('批量元数据响应无效')
  return data.results.map((v:unknown,i:number)=>{const r=object(v);if(r.photo_id!==items[i].photo_id||!['success','conflict'].includes(String(r.status)))throw Error('批量元数据身份无效');return {photoId:r.photo_id as number,status:r.status as 'success'|'conflict',metadata:effectiveMetadata(r.metadata,r.photo_id as number)}})
}
export interface KeywordCoverage {total:number;indexed:number;unknown:number;complete:boolean;source_freshness:string}
function coverage(value:unknown):KeywordCoverage{const v=object(value);if(!integer(v.total)||!integer(v.indexed)||!integer(v.unknown)||Number(v.indexed)+Number(v.unknown)!==v.total||v.complete!==(v.unknown===0)||v.source_freshness!=='verified_at_index_only')throw Error('关键词索引状态无效');return v as unknown as KeywordCoverage}
export async function keywordStatus(orderId:number,signal?:AbortSignal){return coverage((await client.get(`/api/v1/orders/${orderId}/metadata-keywords/status`,{signal})).data)}
export async function rebuildKeywords(orderId:number,afterId:number,signal?:AbortSignal){const {data}=await client.post(`/api/v1/orders/${orderId}/metadata-keywords/rebuild`,{after_id:afterId,limit:10},{signal});if(!Array.isArray(data.processed)||data.processed.length>10||data.processed.some((v:unknown)=>!integer(v)||Number(v)<=afterId)||typeof data.has_more!=='boolean'||(data.has_more&&(!integer(data.next_after_id)||data.next_after_id<=afterId))||!Array.isArray(data.errors)||data.errors.some((v:unknown)=>{const e=object(v);return !integer(e.photo_id)||!data.processed.includes(e.photo_id)||typeof e.code!=='string'}))throw Error('关键词重建响应无效');return {hasMore:data.has_more as boolean,nextAfterId:data.next_after_id as number|null,coverage:coverage(data.coverage),failed:data.errors.length as number}}
