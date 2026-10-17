import { useEffect,useLayoutEffect,useRef,useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui'
import type { PhotoAsset } from '@/api/photoCatalog'
import { AssetThumbnail } from './AssetThumbnail'
import {AnnotationControls} from './AnnotationControls'
import type {AnnotationChanges} from '@/api/photoAnnotations'
import {editableTarget} from './selection'
import type { ThumbnailPool } from './ThumbnailPool'
export type Density='compact'|'normal'|'large'
export interface LibraryViewState {offset:number;density:Density;focusedId:number|null}
const widths={compact:128,normal:192,large:256}
export function AssetGrid({items,pool,onOpen,hasMore,fetching,onMore,initial,onViewState,selected=new Set<number>(),onSelect,onMetadata,busy=false}:{items:PhotoAsset[];pool:ThumbnailPool;onOpen:(asset:PhotoAsset)=>void;hasMore:boolean;fetching:boolean;onMore:()=>void;initial:LibraryViewState;onViewState:(state:LibraryViewState)=>void;selected?:ReadonlySet<number>;onSelect?:(id:number,event:{shiftKey:boolean;ctrlKey:boolean;metaKey:boolean})=>void;onMetadata?:(ids:number[],changes:AnnotationChanges)=>void;busy?:boolean}){
  "use no memo" // TanStack Virtual exposes an imperative instance; do not compiler-memoize this boundary.
  const root=useRef<HTMLDivElement>(null)
  const [width,setWidth]=useState(960),[density,setDensity]=useState<Density>(initial.density),[focusedId,setFocusedId]=useState<number|null>(initial.focusedId??items[0]?.id??null)
  const columns=Math.max(1,Math.floor((width+12)/(widths[density]+12)))
  const detailsHeight=density==='compact'?164:128
  const rowHeight=(width-12*(columns-1))/columns*0.75+detailsHeight
  const rows=Math.ceil(items.length/columns)
  const virtual=useVirtualizer({count:rows+(hasMore?1:0),getScrollElement:()=>root.current,estimateSize:()=>rowHeight,overscan:2,initialOffset:initial.offset,initialRect:{width:960,height:560},useFlushSync:false})
  const anchor=useRef<number|null>(null),previous=useRef({columns,rowHeight}),interactionStart=useRef(0)
  useEffect(()=>{
    const element=root.current;if(!element)return
    const observer=new ResizeObserver(()=>{
      if(element.clientWidth&&element.clientWidth!==width){anchor.current=Math.floor(element.scrollTop/rowHeight)*columns;setWidth(element.clientWidth)}
    })
    observer.observe(element)
    if(element.clientWidth)setWidth(element.clientWidth)
    return ()=>observer.disconnect()
  },[width,rowHeight,columns])
  useLayoutEffect(()=>{
    if(previous.current.columns!==columns||previous.current.rowHeight!==rowHeight){
      virtual.measure()
      if(anchor.current!==null){virtual.scrollToIndex(Math.floor(anchor.current/columns),{align:'start'});anchor.current=null}
      previous.current={columns,rowHeight}
    }
    if(interactionStart.current&&root.current){root.current.dataset.lastInteractionMs=(performance.now()-interactionStart.current).toFixed(2);interactionStart.current=0}
  },[columns,rowHeight,density,focusedId,virtual])
  const virtualRows=virtual.getVirtualItems(),last=virtualRows.at(-1)?.index??-1
  useEffect(()=>{if(hasMore&&!fetching&&last>=rows-2)onMore()},[last,rows,hasMore,fetching,onMore])
  useEffect(()=>{onViewState({offset:root.current?.scrollTop??initial.offset,density,focusedId})},[density,focusedId,onViewState,initial.offset])
  const focusIndex=(index:number)=>{
    const target=Math.max(0,Math.min(items.length-1,index));const asset=items[target];if(!asset)return
    interactionStart.current=performance.now();setFocusedId(asset.id);virtual.scrollToIndex(Math.floor(target/columns),{align:'auto'})
    requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>(`[data-photo-id="${asset.id}"] .asset-open`)?.focus({preventScroll:true}))
  }
  return <section className="asset-grid-section">
    <div className="asset-grid-toolbar"><label htmlFor="library-density">网格密度</label><select id="library-density" value={density} onChange={event=>{
      anchor.current=Math.floor((root.current?.scrollTop??0)/rowHeight)*columns;interactionStart.current=performance.now();setDensity(event.target.value as Density)
    }}><option value="compact">紧凑</option><option value="normal">标准</option><option value="large">宽松</option></select><span>已加载 {items.length} 张{hasMore?' · 可继续浏览':' · 已全部加载'}</span></div>
    <div ref={root} role="grid" aria-label="照片图库" aria-multiselectable="true" aria-rowcount={rows} aria-colcount={columns} tabIndex={0} className="asset-grid-scroll" data-loaded-count={items.length} data-mounted-count={virtualRows.reduce((n,row)=>n+Math.max(0,Math.min(columns,items.length-row.index*columns)),0)}
      onScroll={()=>onViewState({offset:root.current?.scrollTop??0,density,focusedId})}
      onKeyDown={event=>{
        if(editableTarget(event.target)||document.querySelector('[role="dialog"]'))return
        const command=event.ctrlKey||event.metaKey
        if(command&&event.key.toLowerCase()==='a'&&onSelect){event.preventDefault();onSelect(-1,{shiftKey:false,ctrlKey:false,metaKey:false});return}
        if(event.key==='Escape'&&onSelect){event.preventDefault();onSelect(-2,{shiftKey:false,ctrlKey:false,metaKey:false});return}
        if(!command&&!event.altKey&&onMetadata){
          const key=event.key.toLowerCase(),ids=selected.size?[...selected]:focusedId?[focusedId]:[]
          const changes:AnnotationChanges|undefined=/^[0-5]$/.test(key)?{rating:Number(key)}:key==='p'?{pickStatus:'pick'}:key==='x'?{pickStatus:'reject'}:key==='u'?{pickStatus:'unmarked'}:undefined
          if(changes){event.preventDefault();if(!busy)onMetadata(ids,changes);return}
        }
        const index=Math.max(0,items.findIndex(asset=>asset.id===focusedId))
        const next={ArrowRight:index+1,ArrowLeft:index-1,ArrowDown:index+columns,ArrowUp:index-columns,Home:0,End:items.length-1}[event.key]
        if(next!==undefined){event.preventDefault();focusIndex(next)}
        if(event.key==='Enter'&&event.target===root.current&&items[index]){event.preventDefault();onOpen(items[index])}
      }}>
      <div className="asset-grid-space" style={{height:virtual.getTotalSize()}}>
        {virtualRows.map(row=><div key={row.index} role="row" aria-rowindex={row.index+1} className="asset-grid-row" style={{transform:`translateY(${row.start}px)`,height:rowHeight,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
          {items.slice(row.index*columns,(row.index+1)*columns).map(asset=><div key={asset.id} role="gridcell" data-photo-card data-photo-id={asset.id} aria-selected={selected.has(asset.id)} data-selected={selected.has(asset.id)} data-focused={focusedId===asset.id} className="asset-card" style={{height:rowHeight-12}} onClick={event=>{setFocusedId(asset.id);onSelect?.(asset.id,event)}} onDoubleClick={()=>onOpen(asset)}>
            <span className="asset-image" style={{height:rowHeight-detailsHeight}}><AssetThumbnail asset={asset} pool={pool} size={density==='compact'?128:density==='large'?512:256}/></span>
            {onSelect&&<label className="asset-select" onClick={event=>event.stopPropagation()}><input type="checkbox" aria-label={`选择 ${asset.filename}`} checked={selected.has(asset.id)} onChange={()=>onSelect(asset.id,{shiftKey:false,ctrlKey:true,metaKey:false})}/>选择</label>}
            <button type="button" className="asset-open" tabIndex={focusedId===asset.id?0:-1} aria-label={`查看 ${asset.filename}`} onFocus={()=>setFocusedId(asset.id)} onClick={event=>{event.stopPropagation();setFocusedId(asset.id);onOpen(asset)}}>
              <span className="asset-caption" title={asset.filename}>{asset.filename}</span>
            </button>
            {onMetadata&&<AnnotationControls label={asset.filename} value={asset} disabled={busy} onChange={changes=>onMetadata([asset.id],changes)}/>}
          </div>)}
          {row.index===rows&&hasMore&&<div className="asset-load-more">{fetching?'正在加载下一页…':<Button variant="plain" onClick={onMore}>加载更多照片</Button>}</div>}
        </div>)}
      </div>
    </div>
  </section>
}
