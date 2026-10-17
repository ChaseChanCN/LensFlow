import client from './client'
import {annotationDto,defaultAnnotation,type Annotation} from './photoAnnotations'
import {defaultFilters,serializeFilters,type CatalogFilters} from '@/utils/catalogFilters'
export interface PhotoAsset {
  id:number;orderId:number;filename:string;mimeType:string;width:number|null;height:number|null;sizeBytes:number;createdAt:string;displayAspectRatio:number|null
  rating:number;colorLabel:Annotation['colorLabel'];pickStatus:Annotation['pickStatus'];annotationRevision:number
}
export interface CatalogPage {items:PhotoAsset[];nextCursor:string|null;hasMore:boolean}
export function photoAsset(value:unknown):PhotoAsset {
  const v=value as Record<string,unknown>
  if(!v||!Number.isSafeInteger(v.id)||Number(v.id)<1||!Number.isSafeInteger(v.order_id)||Number(v.order_id)<1
    ||typeof v.filename!=='string'||typeof v.mime!=='string'||!Number.isSafeInteger(v.size_bytes)||Number(v.size_bytes)<0
    ||typeof v.created_at!=='string'||!Number.isFinite(Date.parse(v.created_at))
    ||[v.width,v.height].some(n=>n!==null&&(!Number.isSafeInteger(n)||Number(n)<1)))throw new Error('照片元数据无效')
  const width=v.width as number|null,height=v.height as number|null
  const annotation=v.annotation?annotationDto(v.annotation):defaultAnnotation(v.id as number)
  if(annotation.photoId!==v.id)throw new Error('照片标记身份无效')
  return {id:v.id as number,orderId:v.order_id as number,filename:v.filename,mimeType:v.mime,width,height,sizeBytes:v.size_bytes as number,createdAt:v.created_at,displayAspectRatio:width&&height?width/height:null,rating:annotation.rating,colorLabel:annotation.colorLabel,pickStatus:annotation.pickStatus,annotationRevision:annotation.revision}
}
export async function loadCatalog(orderId:number,cursor:string|null,signal:AbortSignal,filters:CatalogFilters=defaultFilters()):Promise<CatalogPage>{
  const {data}=await client.get(`/api/v1/orders/${orderId}/photos/catalog`,{params:{limit:50,...Object.fromEntries(new URLSearchParams(serializeFilters(filters))),...(cursor?{cursor}:{})},signal})
  if(!data||!Array.isArray(data.items)||typeof data.has_more!=='boolean'||(data.next_cursor!==null&&typeof data.next_cursor!=='string')||data.has_more!==(typeof data.next_cursor==='string'))throw new Error('图库分页响应无效')
  const items=data.items.map(photoAsset) as PhotoAsset[]
  if(items.some(asset=>asset.orderId!==orderId)||new Set(items.map(asset=>asset.id)).size!==items.length)throw new Error('图库照片身份或归属无效')
  if(filters.sort.startsWith('id_')&&items.some((asset,i)=>i>0&&(filters.sort==='id_asc'?asset.id<=items[i-1].id:asset.id>=items[i-1].id)))throw new Error('图库照片顺序无效')
  return {items,nextCursor:data.next_cursor,hasMore:data.has_more}
}
export async function loadAsset(orderId:number,photoId:number,signal:AbortSignal):Promise<PhotoAsset>{
  const {data}=await client.get(`/api/v1/orders/${orderId}/photos/${photoId}/asset`,{signal})
  const asset=photoAsset(data)
  if(asset.id!==photoId||asset.orderId!==orderId)throw new Error('照片归属无效')
  return asset
}
export async function loadThumbnail(photoId:number,size:128|256|512,signal:AbortSignal):Promise<Blob>{
  const {data}=await client.get(`/api/v1/photos/${photoId}/thumbnail`,{params:{size},responseType:'blob',signal})
  if(!(data instanceof Blob)||data.type.split(';')[0]!=='image/jpeg')throw new Error('缩略图响应无效')
  return data
}
