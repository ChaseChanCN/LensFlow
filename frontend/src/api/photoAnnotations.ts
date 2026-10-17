import client from './client'
export type ColorLabel='red'|'yellow'|'green'|'blue'|'purple'|null
export type PickStatus='unmarked'|'pick'|'reject'
export interface Annotation {photoId:number;rating:number;colorLabel:ColorLabel;pickStatus:PickStatus;revision:number}
export type AnnotationChanges=Partial<Pick<Annotation,'rating'|'colorLabel'|'pickStatus'>>
export const defaultAnnotation=(photoId:number):Annotation=>({photoId,rating:0,colorLabel:null,pickStatus:'unmarked',revision:0})
export function annotationDto(value:unknown):Annotation {
  const a=value as Record<string,unknown>
  if(!a||!Number.isSafeInteger(a.photo_id)||Number(a.photo_id)<1||!Number.isInteger(a.rating)||Number(a.rating)<0||Number(a.rating)>5||!Number.isSafeInteger(a.revision)||Number(a.revision)<0||![null,'red','yellow','green','blue','purple'].includes(a.color_label as string|null)||!['unmarked','pick','reject'].includes(a.pick_status as string))throw new Error('照片标记响应无效')
  return {photoId:a.photo_id as number,rating:a.rating as number,colorLabel:a.color_label as ColorLabel,pickStatus:a.pick_status as PickStatus,revision:a.revision as number}
}
export async function readAnnotation(id:number){const {data}=await client.get(`/api/v1/photos/${id}/annotation`);const a=annotationDto(data);if(a.photoId!==id)throw new Error('标记照片不匹配');return a}
export async function saveAnnotation(a:Annotation){const {data}=await client.put(`/api/v1/photos/${a.photoId}/annotation`,{rating:a.rating,color_label:a.colorLabel,pick_status:a.pickStatus,expected_revision:a.revision});return annotationDto(data)}
export interface AnnotationResult {photoId:number;status:'success'|'conflict';annotation:Annotation}
export async function batchAnnotations(items:{photoId:number;revision:number}[],changes:AnnotationChanges):Promise<AnnotationResult[]> {
  if(!items.length||items.length>100||new Set(items.map(i=>i.photoId)).size!==items.length)throw new Error('批量标记数量无效')
  const fields={...('rating' in changes?{rating:changes.rating}:{}),...('colorLabel' in changes?{color_label:changes.colorLabel}:{}),...('pickStatus' in changes?{pick_status:changes.pickStatus}:{})}
  const {data}=await client.post('/api/v1/photos/annotations/batch',{items:items.map(i=>({photo_id:i.photoId,expected_revision:i.revision})),changes:fields})
  if(!data||!Array.isArray(data.results)||data.results.length!==items.length)throw new Error('批量结果不完整，请刷新标记后重试')
  const seen=new Set<number>()
  return data.results.map((value:Record<string,unknown>)=>{const a=annotationDto(value.annotation);if(value.photo_id!==a.photoId||!items.some(i=>i.photoId===a.photoId)||seen.has(a.photoId)||!['success','conflict'].includes(value.status as string))throw new Error('批量结果无效');seen.add(a.photoId);return {photoId:a.photoId,status:value.status as 'success'|'conflict',annotation:a}})
}
