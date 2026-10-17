import { useEffect,useRef } from 'react'
import { pointerInImage,type CropRect } from '@/utils/imageGeometry'
import { dragCrop } from './cropInteraction'
const handles=[['nw','左上'],['n','上'],['ne','右上'],['e','右'],['se','右下'],['s','下'],['sw','左下'],['w','左']] as const
export function CropOverlay({crop,onChange,ratio,width,height,onCancel}:{crop:CropRect;onChange:(crop:CropRect)=>void;ratio:number|null;width:number;height:number;onCancel:()=>void}) {
  const root=useRef<HTMLDivElement>(null)
  const gesture=useRef<{start:CropRect;x:number;y:number;handle:string;rect:DOMRect;pointer:number}|null>(null)
  const frame=useRef(0),pending=useRef<CropRect|null>(null)
  const flush=()=>{cancelAnimationFrame(frame.current);if(pending.current){onChange(pending.current);pending.current=null}}
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[])
  return <div ref={root} className="photo-crop-overlay" role="group" aria-label="裁剪框" tabIndex={0}
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onCancel()}}}
    onPointerDown={event=>{
      const handle=(event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle
      if(!handle||!root.current||gesture.current) return
      event.preventDefault();root.current.focus();const rect=root.current.getBoundingClientRect(),point=pointerInImage(event.clientX,event.clientY,rect)
      gesture.current={start:{...crop},x:point.x,y:point.y,handle,rect,pointer:event.pointerId}
      root.current.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event=>{
      const g=gesture.current;if(!g||g.pointer!==event.pointerId)return
      const point=pointerInImage(event.clientX,event.clientY,g.rect)
      pending.current=dragCrop(g.start,point.x-g.x,point.y-g.y,g.handle,ratio,width,height)
      cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(flush)
    }}
    onPointerUp={event=>{if(gesture.current?.pointer!==event.pointerId)return;flush();gesture.current=null;if(root.current?.hasPointerCapture(event.pointerId))root.current.releasePointerCapture(event.pointerId)}}
    onPointerCancel={()=>{cancelAnimationFrame(frame.current);pending.current=null;if(gesture.current)onChange(gesture.current.start);gesture.current=null}}
    onLostPointerCapture={()=>{gesture.current=null}}
  >
    <div className="photo-crop-selection" data-handle="move" style={{left:`${crop.x*100}%`,top:`${crop.y*100}%`,width:`${crop.width*100}%`,height:`${crop.height*100}%`}}>
      {[1,2].map(n=><span key={`v${n}`} className="photo-crop-guide vertical" style={{left:`${n*100/3}%`}}/>)}
      {[1,2].map(n=><span key={`h${n}`} className="photo-crop-guide horizontal" style={{top:`${n*100/3}%`}}/>)}
      {handles.map(([handle,label])=><button type="button" key={handle} aria-label={`调整裁剪 ${label}`} data-handle={handle} className={`photo-crop-handle handle-${handle}`}
        onKeyDown={event=>{
          if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return
          event.preventDefault();event.stopPropagation()
          const step=event.shiftKey?10:1
          onChange(dragCrop(crop,event.key==='ArrowLeft'?-step/width:event.key==='ArrowRight'?step/width:0,event.key==='ArrowUp'?-step/height:event.key==='ArrowDown'?step/height:0,handle,ratio,width,height))
        }}/>) }
    </div>
  </div>
}
