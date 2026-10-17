import {metadataKeys,parseMetadataFilters,serializeMetadata,type MetadataFilters} from './metadataFilters'
export const catalogSorts=['id_asc','id_desc','created_asc','created_desc','rating_asc','rating_desc'] as const
export type CatalogSort=typeof catalogSorts[number]
export interface CatalogFilters {rating:number|null;ratingMin:number|null;colors:string[];pick:string[];sort:CatalogSort;metadata?:MetadataFilters}
export const defaultFilters=():CatalogFilters=>({rating:null,ratingMin:null,colors:[],pick:[],sort:'id_asc'})
const allowed=['rating','rating_min','colors','pick','sort',...metadataKeys]
function csv(value:string|null,values:string[]){if(value===null)return [];const parts=value.split(',').map(v=>v.trim());if(parts.length>values.length||parts.some(v=>!values.includes(v)))throw Error('筛选条件含无效选项');return [...new Set(parts)].sort()}
export function parseFilters(search:URLSearchParams):CatalogFilters {
  if([...search.keys()].some(key=>!allowed.includes(key)||search.getAll(key).length!==1))throw Error('筛选地址含未知或重复参数')
  const rating=(key:string)=>{const v=search.get(key);if(v===null)return null;if(!/^[0-5]$/.test(v))throw Error('评分条件必须为 0–5');return Number(v)}
  const exact=rating('rating'),minimum=rating('rating_min'),sort=search.get('sort')??'id_asc'
  if(exact!==null&&minimum!==null)throw Error('精确评分和最低评分不能同时设置')
  if(!(catalogSorts as readonly string[]).includes(sort))throw Error('排序条件无效')
  const metadata=parseMetadataFilters(search)
  return {rating:exact,ratingMin:minimum||null,colors:csv(search.get('colors'),['none','red','yellow','green','blue','purple']),pick:csv(search.get('pick'),['unmarked','pick','reject']),sort:sort as CatalogSort,...(metadata?{metadata}:{})}
}
export function serializeFilters(filters:CatalogFilters){
  const params=new URLSearchParams()
  if(filters.rating!==null)params.set('rating',String(filters.rating))
  if(filters.ratingMin!==null&&filters.ratingMin!==0)params.set('rating_min',String(filters.ratingMin))
  if(filters.colors.length)params.set('colors',[...new Set(filters.colors)].sort().join(','))
  if(filters.pick.length)params.set('pick',[...new Set(filters.pick)].sort().join(','))
  if(filters.sort!=='id_asc')params.set('sort',filters.sort)
  for(const [key,value] of serializeMetadata(filters.metadata))params.set(key,value)
  return params.toString()
}
export const sensitiveCatalog=(signature:string)=>{const f=parseFilters(new URLSearchParams(signature));return f.rating!==null||f.ratingMin!==null||!!(f.colors.length||f.pick.length)||f.sort.startsWith('rating_')}
export function libraryPath(orderId:number,search=''){const clean=serializeFilters(parseFilters(new URLSearchParams(search)));return `/orders/${orderId}/library${clean?'?'+clean:''}`}
export function compareIds(a:string|null,b:string|null):[number,number]|null{const values=[a,b];if(values.some(v=>v===null||!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<1)||a===b)return null;const result=values.map(Number);if(result[0]===result[1])return null;return result as [number,number]}
export function lightTablePath(orderId:number,ids:[number,number],search=''){const params=new URLSearchParams({a:String(ids[0]),b:String(ids[1])});const clean=serializeFilters(parseFilters(new URLSearchParams(search)));if(clean)params.set('library',clean);return `/orders/${orderId}/light-table?${params}`}
export function editorPath(orderId:number,id:number,search='',ids?:[number,number]){const params=new URLSearchParams({from:'library'});if(search)params.set('library',serializeFilters(parseFilters(new URLSearchParams(search))));if(ids)params.set('compare',ids.join(','));return `/orders/${orderId}/photos/${id}/edit?${params}`}
