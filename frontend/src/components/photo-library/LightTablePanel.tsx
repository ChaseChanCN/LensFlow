import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {PhotoAsset} from '@/api/photoCatalog'
import type {AnnotationChanges} from '@/api/photoAnnotations'
import {usePhotoResource} from '@/components/photo-editor/usePhotoResource'
import {Button,ErrorState,LoadingState} from '@/components/ui'
import {AnnotationControls} from './AnnotationControls'
import {compareGeometry,fitView,panView,type CompareView} from './lightTableMath'

export function LightTablePanel({asset,label,view,onView,onFocus,onMetadata,onEdit,blocked,notice,autoFocus=false,onSettled}:{asset:PhotoAsset;label:string;view:CompareView;onView:(v:CompareView)=>void;onFocus:()=>void;onMetadata:(ids:number[],changes:AnnotationChanges)=>void;onEdit:()=>void;blocked:boolean;notice?:string;autoFocus?:boolean;onSettled?:()=>void}){
  const {resource,error,retry}=usePhotoResource(asset.id),viewport=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null)
  const [size,setSize]=useState({width:500,height:440}),drag=useRef<{id:number;x:number;y:number;geometry:ReturnType<typeof compareGeometry>}|null>(null)
  const geometry=compareGeometry(resource?.width??1,resource?.height??1,size.width,size.height,view)
  const latest=useRef({geometry,onView,onFocus})
  useLayoutEffect(()=>{latest.current={geometry,onView,onFocus}},[geometry,onView,onFocus])
  useEffect(()=>{
    const node=viewport.current;if(!node)return
    const resize=()=>{if(node.clientWidth&&node.clientHeight)setSize({width:node.clientWidth,height:node.clientHeight})}
    const observer=new ResizeObserver(resize);observer.observe(node);resize()
    if(autoFocus)node.focus({preventScroll:true})
    const wheel=(event:WheelEvent)=>{if(event.ctrlKey||event.metaKey)return;event.preventDefault();const current=latest.current;current.onFocus();current.onView({...current.geometry.view,zoom:Math.min(8,Math.max(1,current.geometry.view.zoom*Math.exp(-event.deltaY*.0015)))})}
    node.addEventListener('wheel',wheel,{passive:false})
    return ()=>{observer.disconnect();node.removeEventListener('wheel',wheel)}
  },[autoFocus])
  useEffect(()=>{const node=canvas.current;if(!node||!resource)return;node.width=resource.width;node.height=resource.height;node.getContext('2d')?.drawImage(resource.image,0,0);return()=>{node.width=0;node.height=0}},[resource])
  useEffect(()=>{if(resource||error)onSettled?.()},[resource,error,onSettled])
  const change=(next:CompareView)=>onView(compareGeometry(resource?.width??1,resource?.height??1,size.width,size.height,next).view)
  return <section className="light-table-panel" aria-label={`${label}：${asset.filename}`} onFocusCapture={onFocus}>
    <h2>{label} · {asset.filename}</h2>
    <AnnotationControls label={`${label} ${asset.filename}`} value={asset} disabled={blocked} onChange={changes=>onMetadata([asset.id],changes)}/>
    {notice&&<p role="status">{notice}</p>}
    <div className="light-table-tools"><Button variant="plain" onClick={()=>change(fitView())}>适应{label}</Button><Button variant="plain" aria-label={`${label}缩小`} onClick={()=>change({...geometry.view,zoom:geometry.view.zoom/1.25})}>−</Button><output aria-label={`${label}缩放比例`}>{Math.round(geometry.view.zoom*100)}%</output><Button variant="plain" aria-label={`${label}放大`} onClick={()=>change({...geometry.view,zoom:geometry.view.zoom*1.25})}>＋</Button><Button variant="plain" onClick={onEdit}>编辑这张照片（{label}）</Button></div>
    <div ref={viewport} tabIndex={0} role="group" aria-label={`${label}照片视口`} className="light-table-viewport" data-photo-id={asset.id} data-zoom={geometry.view.zoom} data-center-x={geometry.view.cx} data-center-y={geometry.view.cy} style={{touchAction:'none'}}
      onPointerDown={event=>{if(event.button!==0)return;onFocus();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,geometry}}}
      onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;change(panView(start.geometry,event.clientX-start.x,event.clientY-start.y))}}
      onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null}}
      onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}
      onKeyDown={event=>{if(event.ctrlKey||event.metaKey||event.altKey)return;const move={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]}[event.key];if(move){event.preventDefault();change(panView(geometry,move[0],move[1]))}}}
      onDoubleClick={()=>change(geometry.view.zoom>1?fitView():{...fitView(),zoom:2})}>
      {error?<ErrorState title={error} onRetry={retry}/>:!resource?<LoadingState label={`正在读取${label}认证预览`}/>:<canvas ref={canvas} role="img" aria-label={`${label}原始照片预览`} style={{position:'absolute',width:geometry.width,height:geometry.height,left:geometry.left,top:geometry.top}}/>}
    </div>
    <p className="asset-library-note">预览 {resource?`${resource.width} × ${resource.height}`:'加载中'} · 100% 为适应视口 · 放大使用最长边1024px预览，不代表原图像素级检查。</p>
  </section>
}
