import type {PhotoAsset} from '@/api/photoCatalog'
import type {AnnotationChanges,ColorLabel,PickStatus} from '@/api/photoAnnotations'
import {Button} from '@/components/ui'
import {colorNames,pickNames} from './annotationLabels'
export function BatchToolbar({assets,busy,onChange,onAll,onClear}:{assets:PhotoAsset[];busy:boolean;onChange:(changes:AnnotationChanges)=>void;onAll:()=>void;onClear:()=>void}){
  const mixed=(field:'rating'|'colorLabel'|'pickStatus')=>new Set(assets.map(a=>a[field])).size>1
  return <section className="asset-batch-toolbar" aria-label="批量标记">
    <strong>已选 {assets.length} 张</strong><Button variant="plain" onClick={onAll}>全选已加载</Button><Button variant="plain" onClick={onClear}>清除选择</Button>
    <select aria-label="批量评分" value="" disabled={busy||!assets.length} onChange={e=>onChange({rating:Number(e.target.value)})}><option value="">{mixed('rating')?'评分：混合值':'设置评分'}</option>{[0,1,2,3,4,5].map(n=><option key={n} value={n}>{n} 星</option>)}</select>
    <select aria-label="批量颜色" value="" disabled={busy||!assets.length} onChange={e=>onChange({colorLabel:e.target.value==='none'?null:e.target.value as ColorLabel})}><option value="">{mixed('colorLabel')?'颜色：混合值':'设置颜色'}</option>{Object.entries(colorNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
    <select aria-label="批量标记" value="" disabled={busy||!assets.length} onChange={e=>onChange({pickStatus:e.target.value as PickStatus})}><option value="">{mixed('pickStatus')?'标记：混合值':'设置标记'}</option>{Object.entries(pickNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
  </section>
}
