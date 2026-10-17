import type {AnnotationChanges,ColorLabel,PickStatus} from '@/api/photoAnnotations'
import {colorNames,pickNames} from './annotationLabels'
export interface AnnotationValues {rating:number;colorLabel:ColorLabel;pickStatus:PickStatus}
export function AnnotationControls({value,onChange,disabled=false,label}:{value:AnnotationValues;onChange:(changes:AnnotationChanges)=>void;disabled?:boolean;label:string}){
  return <div className="asset-annotation-controls" onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
    <label><span className="sr-only">{label}评分</span><select aria-label={`${label}评分`} value={value.rating} disabled={disabled} onChange={event=>onChange({rating:Number(event.target.value)})}>{[0,1,2,3,4,5].map(n=><option key={n} value={n}>{n?`${n} ★`:'0 ☆'}</option>)}</select></label>
    <select className="asset-color" data-color={value.colorLabel??'none'} aria-label={`${label}颜色`} value={value.colorLabel??'none'} disabled={disabled} onChange={event=>onChange({colorLabel:event.target.value==='none'?null:event.target.value as ColorLabel})}>{Object.entries(colorNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
    <select aria-label={`${label}标记`} value={value.pickStatus} disabled={disabled} onChange={event=>onChange({pickStatus:event.target.value as PickStatus})}>{Object.entries(pickNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
  </div>
}
