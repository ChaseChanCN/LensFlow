export function selectAsset(current:ReadonlySet<number>,ids:number[],id:number,anchor:number|null,event:{shiftKey:boolean;ctrlKey:boolean;metaKey:boolean}):{selected:Set<number>;anchor:number} {
  if(event.shiftKey&&anchor!==null&&ids.includes(anchor)){
    const from=ids.indexOf(anchor),to=ids.indexOf(id),range=ids.slice(Math.min(from,to),Math.max(from,to)+1)
    return {selected:new Set(event.ctrlKey||event.metaKey?[...current,...range]:range),anchor}
  }
  const selected=event.ctrlKey||event.metaKey?new Set(current):new Set<number>()
  if(selected.has(id))selected.delete(id);else selected.add(id)
  return {selected,anchor:id}
}
export const reconcileSelection=(selected:ReadonlySet<number>,ids:number[])=>new Set([...selected].filter(id=>ids.includes(id)))
export function editableTarget(target:EventTarget|null){return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')}
