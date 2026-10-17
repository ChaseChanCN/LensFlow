import type {CatalogFilters,CatalogSort} from '@/utils/catalogFilters'
import {defaultFilters,serializeFilters} from '@/utils/catalogFilters'
import {Button} from '@/components/ui'
import {colorNames,pickNames} from './annotationLabels'
export function FilterBar({value,onChange,disabled}:{value:CatalogFilters;onChange:(value:CatalogFilters)=>void;disabled:boolean}){
  const toggle=(key:'colors'|'pick',item:string)=>onChange({...value,[key]:value[key].includes(item)?value[key].filter(v=>v!==item):[...value[key],item].sort()})
  const [field,direction]=value.sort.split('_')
  return <section aria-label="目录筛选与排序" className="asset-filter-bar">
    <label>评分条件<select aria-label="评分条件" disabled={disabled} value={value.rating!==null?'eq'+value.rating:value.ratingMin!==null?'min'+value.ratingMin:'all'} onChange={e=>onChange({...value,rating:e.target.value.startsWith('eq')?Number(e.target.value.slice(2)):null,ratingMin:e.target.value.startsWith('min')?Number(e.target.value.slice(3)):null})}><option value="all">所有评分</option>{[0,1,2,3,4,5].map(n=><option key={'eq'+n} value={'eq'+n}>恰好 {n} 星</option>)}{[1,2,3,4,5].map(n=><option key={'min'+n} value={'min'+n}>至少 {n} 星</option>)}</select></label>
    <fieldset disabled={disabled}><legend>颜色（组内或）</legend>{Object.entries(colorNames).map(([key,name])=><label key={key}><input type="checkbox" aria-label={`筛选${name}`} checked={value.colors.includes(key)} onChange={()=>toggle('colors',key)}/>{name}</label>)}</fieldset>
    <fieldset disabled={disabled}><legend>标记（组内或）</legend>{Object.entries(pickNames).map(([key,name])=><label key={key}><input type="checkbox" aria-label={`筛选${name}`} checked={value.pick.includes(key)} onChange={()=>toggle('pick',key)}/>{name}</label>)}</fieldset>
    <label>排序字段<select aria-label="排序字段" value={field} disabled={disabled} onChange={e=>onChange({...value,sort:`${e.target.value}_${direction}` as CatalogSort})}><option value="id">照片 ID</option><option value="created">创建时间</option><option value="rating">评分</option></select></label>
    <label>排序方向<select aria-label="排序方向" value={direction} disabled={disabled} onChange={e=>onChange({...value,sort:`${field}_${e.target.value}` as CatalogSort})}><option value="asc">升序</option><option value="desc">降序</option></select></label>
    <Button variant="plain" disabled={disabled} onClick={()=>onChange(defaultFilters())}>重置筛选与排序</Button><span className="asset-library-note">{serializeFilters(value)?'已启用查询条件 · 类别之间为且':'所有照片 · ID 升序'}</span>
  </section>
}
