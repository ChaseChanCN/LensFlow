import client from './client'
import { serializeFilters, type CatalogFilters } from '@/utils/catalogFilters'
import { metadataSummary } from './photoMetadata'
export interface IndexCounts { total: number; indexed: number; pending: number; failed: number; unsupported: number; unindexed: number; active: number; generation: string; parser_version: string }
export type IndexMode = 'missing' | 'retry' | 'refresh'
export interface IndexOutcome {photo_id:number;status:'pending'|'indexed'|'failed'|'unsupported';busy:boolean;reused:boolean;error_code:string|null}
export interface IndexBatch { results: IndexOutcome[]; next_cursor: string | null; counts: IndexCounts; continuation: 'client_driven' }
export interface MetadataFacets { camera_make: {value:string;count:number}[]; camera_model: {value:string;count:number}[]; lens_make: {value:string;count:number}[]; lens_model: {value:string;count:number}[]; truncated: boolean; counts: IndexCounts }
export interface CaptureTimeline { level: 'year'|'month'|'day'; buckets: {date:string;count:number;captured_from:string;captured_to:string}[]; unknown:number; matched:number; counts:IndexCounts; truncated:boolean }
function object(value: unknown): Record<string,unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('索引响应无效'); return value as Record<string,unknown> }
const indexStates=['pending','indexed','failed','unsupported'] as const
export const indexErrorMessages:Readonly<Record<string,string>>={
  METADATA_BUSY:'元数据读取繁忙，请稍后重试', LEASE_EXPIRED:'上次处理超时，可重新索引', INDEX_DATABASE_BUSY:'索引数据库繁忙，请稍后重试',
  UNSUPPORTED_FORMAT:'当前仅支持 JPEG', UNSUPPORTED_STORAGE:'当前存储不支持读取原始文件', UNSUPPORTED_JPEG:'此 JPEG 编码暂不支持',
  UNSUPPORTED_COLOR_SPACE:'此色彩模式暂不支持', INVALID_JPEG:'JPEG 文件无效或损坏', IMAGE_TOO_LARGE:'原始文件超过处理上限',
  METADATA_TOO_LARGE:'元数据超过安全解析上限', NOT_FOUND:'原始文件不存在', STORAGE_UNAVAILABLE:'原始文件暂时无法读取',
  VALIDATION_ERROR:'文件未通过校验', EXTRACTION_FAILED:'元数据提取失败', METADATA_WARNINGS:'部分元数据存在警告', UNKNOWN:'服务返回未识别的诊断代码',
}
function errorCode(value:unknown):string|null {
  if(value===null)return null
  if(typeof value!=='string')throw Error('索引错误代码无效')
  return Object.hasOwn(indexErrorMessages,value)?value:'UNKNOWN'
}
function positiveId(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<1)throw Error('诊断照片编号无效');return Number(value)}
function boundedText(value:unknown,max:number):string{if(typeof value!=='string'||!value||value.length>max||[...value].some(c=>c.charCodeAt(0)<32))throw Error('诊断文本无效');return value}
function parserVersion(value:unknown):string{return boundedText(value,32)}
function nextCursor(value:unknown):string|null{if(value===null)return null;return boundedText(value,512)}
export function indexOutcome(value:unknown):IndexOutcome {
  const v=object(value)
  if(!indexStates.includes(v.status as typeof indexStates[number])||typeof v.busy!=='boolean'||typeof v.reused!=='boolean')throw Error('索引结果无效')
  return {photo_id:positiveId(v.photo_id),status:v.status as IndexOutcome['status'],busy:v.busy,reused:v.reused,error_code:errorCode(v.error_code)}
}
export function indexCounts(value: unknown): IndexCounts {
  const v=object(value)
  for(const key of ['total','indexed','pending','failed','unsupported','unindexed','active']) if(!Number.isSafeInteger(v[key])||Number(v[key])<0)throw Error('索引计数无效')
  if(typeof v.generation!=='string'||typeof v.parser_version!=='string'||v.total!==Number(v.indexed)+Number(v.pending)+Number(v.failed)+Number(v.unsupported)||Number(v.unindexed)>Number(v.pending)||Number(v.active)>Number(v.total))throw Error('索引统计不一致')
  return Object.fromEntries(['total','indexed','pending','failed','unsupported','unindexed','active','generation','parser_version'].map(k=>[k,v[k]])) as unknown as IndexCounts
}
export async function loadIndexStatus(orderId:number,signal:AbortSignal){const {data}=await client.get(`/api/v1/orders/${orderId}/metadata-index/status`,{signal});return indexCounts(data)}
export async function indexBatch(orderId:number,mode:IndexMode,cursor:string|null,signal:AbortSignal):Promise<IndexBatch>{
  const {data}=await client.post(`/api/v1/orders/${orderId}/metadata-index`,{mode,limit:10,cursor},{signal,timeout:60000})
  if(!data||!Array.isArray(data.results)||data.results.length>10||data.continuation!=='client_driven'||(data.next_cursor!==null&&typeof data.next_cursor!=='string'))throw Error('索引批次响应无效')
  const results=data.results.map(indexOutcome)
  if(new Set(results.map((v:IndexOutcome)=>v.photo_id)).size!==results.length)throw Error('索引批次照片重复')
  return {results,next_cursor:nextCursor(data.next_cursor),counts:indexCounts(data.counts),continuation:'client_driven'}
}
export async function loadMetadataFacets(orderId:number,signal:AbortSignal):Promise<MetadataFacets>{
  const {data}=await client.get(`/api/v1/orders/${orderId}/photos/metadata-facets`,{signal})
  for(const key of ['camera_make','camera_model','lens_make','lens_model'])if(!Array.isArray(data?.[key])||data[key].length>50||data[key].some((v:unknown)=>{const item=object(v);return typeof item.value!=='string'||item.value.length>160||!Number.isSafeInteger(item.count)||Number(item.count)<1}))throw Error('设备选项响应无效')
  if(typeof data.truncated!=='boolean')throw Error('设备选项响应无效')
  return {...data,counts:indexCounts(data.counts)}
}
export function timelineParent(filters:CatalogFilters){
  const m=filters.metadata,from=m?.captured_from,to=m?.captured_to
  if(from&&to&&from.slice(0,7)===to.slice(0,7))return {level:'day' as const,year:Number(from.slice(0,4)),month:Number(from.slice(5,7))}
  if(from&&to&&from.slice(0,4)===to.slice(0,4))return {level:'month' as const,year:Number(from.slice(0,4))}
  return {level:'year' as const}
}
export async function loadTimeline(orderId:number,filters:CatalogFilters,signal:AbortSignal):Promise<CaptureTimeline>{
  const metadata={...filters.metadata};delete metadata.captured_from;delete metadata.captured_to;delete metadata.capture_unknown
  const params={...Object.fromEntries(new URLSearchParams(serializeFilters({...filters,metadata}))),...timelineParent(filters)}
  const {data}=await client.get(`/api/v1/orders/${orderId}/photos/timeline`,{params,signal})
  if(!data||!['year','month','day'].includes(data.level)||!Array.isArray(data.buckets)||data.buckets.length>200||!Number.isSafeInteger(data.unknown)||data.unknown<0||!Number.isSafeInteger(data.matched)||typeof data.truncated!=='boolean')throw Error('时间线响应无效')
  for(const b of data.buckets)if(typeof b.date!=='string'||!/^\d{4}(?:-\d{2}){0,2}$/.test(b.date)||!Number.isSafeInteger(b.count)||b.count<1||!/^\d{4}-\d{2}-\d{2}$/.test(b.captured_from)||!/^\d{4}-\d{2}-\d{2}$/.test(b.captured_to))throw Error('时间线日期无效')
  return {...data,counts:indexCounts(data.counts)}
}

export type IssueCategory='failed'|'unsupported'|'warnings'|'pending'
export interface MetadataIssue {
  photo_id:number;filename:string;index_status:IndexOutcome['status'];error_code:string|null;warning_count:number;indexed_at:string|null;
  retryable:boolean;current_parser_version:string;parser_version:string|null;identity_state:'current_parser'|'stale_parser'|'unindexed';source_verified:false
}
export interface MetadataIssuePage {items:MetadataIssue[];next_cursor:string|null}
export function metadataIssue(value:unknown):MetadataIssue {
  const v=object(value),identity=v.identity_state
  if(!indexStates.includes(v.index_status as IndexOutcome['status'])||!['current_parser','stale_parser','unindexed'].includes(String(identity))
    ||!Number.isSafeInteger(v.warning_count)||Number(v.warning_count)<0||typeof v.retryable!=='boolean'||v.source_verified!==false)throw Error('索引诊断响应无效')
  const current=parserVersion(v.current_parser_version),parser=v.parser_version===null?null:parserVersion(v.parser_version)
  const indexedAt=v.indexed_at===null?null:boundedText(v.indexed_at,40)
  if(indexedAt!==null&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(indexedAt)||!Number.isFinite(Date.parse(indexedAt))))throw Error('索引诊断时间无效')
  if((identity==='current_parser'&&parser!==current)||(identity==='stale_parser'&&(parser===null||parser===current))||(identity==='unindexed'&&parser!==null)
    ||(identity!=='current_parser'&&v.index_status!=='pending'))throw Error('索引诊断身份无效')
  return {photo_id:positiveId(v.photo_id),filename:boundedText(v.filename,255),index_status:v.index_status as IndexOutcome['status'],error_code:errorCode(v.error_code),
    warning_count:Number(v.warning_count),indexed_at:indexedAt,retryable:v.retryable,current_parser_version:current,parser_version:parser,
    identity_state:identity as MetadataIssue['identity_state'],source_verified:false}
}
export async function loadMetadataIssues(orderId:number,status:string,cursor:string|null,signal:AbortSignal):Promise<MetadataIssuePage>{
  const categories=status.split(',')
  if(!categories.length||categories.some(s=>!['failed','unsupported','warnings','pending'].includes(s))||new Set(categories).size!==categories.length)throw Error('诊断类别无效')
  const {data}=await client.get(`/api/v1/orders/${positiveId(orderId)}/metadata-index/issues`,{params:{status:categories.sort().join(','),limit:20,...(cursor?{cursor}:{} )},signal})
  if(!data||!Array.isArray(data.items)||data.items.length>20)throw Error('索引诊断列表无效')
  const items:MetadataIssue[]=data.items.map(metadataIssue)
  if(new Set(items.map(v=>v.photo_id)).size!==items.length||items.some((v,i)=>i>0&&v.photo_id<=items[i-1].photo_id))throw Error('索引诊断顺序无效')
  return {items,next_cursor:nextCursor(data.next_cursor)}
}
export async function retryMetadataIssue(photoId:number,signal:AbortSignal):Promise<IndexOutcome>{
  const id=positiveId(photoId),{data}=await client.post(`/api/v1/photos/${id}/metadata-index`,{},{signal,timeout:60000})
  const result=indexOutcome(data)
  if(result.photo_id!==id)throw Error('索引结果照片不匹配')
  return result
}

// Fixed parser identifiers only. Unknown response text never enters diagnostic UI state.
const knownWarningCodes=new Set([
  'text.invalid_encoding','text.controls_removed','text.truncated','keywords.truncated',
  'iptc.invalid_packet','iptc.latin1_fallback','iptc.invalid_encoding','iptc.duplicate_field','iptc.invalid_time','iptc.invalid_date',
  'xmp.invalid_or_unsafe_packet','xmp.duplicate_field','xmp.invalid_language','xmp.duplicate_language','xmp.language_fallback','xmp.invalid_gps',
  'jpeg.trailing_data','exif.duplicate_packet','xmp.duplicate_packet','xmp.extended_unsupported','icc.invalid_chunks','icc.invalid_profile',
  'exif.duplicate_tag','exif.invalid_type','exif.invalid_count','exif.invalid_offset','exif.invalid_rational','exif.invalid_ifd','exif.invalid_packet',
  'exif.invalid_date','exif.invalid_subsecond','exif.invalid_offset_time','xmp.photoshop.invalid_date','xmp.create.invalid_date','capture.date_ambiguity',
  'gps.invalid_coordinate','gps.invalid','gps.altitude.invalid','gps.incomplete',
  ...['exposure_seconds','f_number','iso','focal_length_mm','focal_length_35mm_mm','exposure_bias_ev','orientation','flash'].map(v=>`capture.${v}.invalid`),
  ...['title','caption','creator','copyright'].map(v=>`description.${v}.conflict`),
])
export interface MetadataWarningDetails {photo_id:number;warnings:string[];unrecognized_count:number}
export async function loadMetadataWarningDetails(photoId:number,signal:AbortSignal):Promise<MetadataWarningDetails>{
  const id=positiveId(photoId),{data}=await client.get(`/api/v1/photos/${id}/metadata`,{signal})
  metadataSummary(data,id)
  if(!Array.isArray(data.warnings)||data.warnings.length>100||data.warnings.some((v:unknown)=>typeof v!=='string'||v.length>128))throw Error('元数据警告响应无效')
  const warnings=[...new Set<string>(data.warnings.filter((v:string)=>knownWarningCodes.has(v)))]
  return {photo_id:id,warnings,unrecognized_count:data.warnings.filter((v:string)=>!knownWarningCodes.has(v)).length}
}
