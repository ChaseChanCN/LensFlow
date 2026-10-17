import axios from 'axios'
import { loadThumbnail } from '@/api/photoCatalog'
export type ThumbnailSize=128|256|512
export type ThumbnailState={status:'loading'|'ready'|'error';url?:string;error?:string}
const LOADING:ThumbnailState={status:'loading'}
type Entry={id:number;size:ThumbnailSize;state:ThumbnailState;blob?:Blob;controller:AbortController;listeners:Set<()=>void>;running:boolean;queued:boolean;used:number;attempt:number;timer?:ReturnType<typeof setTimeout>}
/** Per-authenticated-library lifetime. Bounded requests and Blob LRU; URLs exist only while subscribed. */
export class ThumbnailPool {
  private entries=new Map<string,Entry>()
  private active=0
  private disposed=false
  private authenticated:boolean
  constructor(authenticated=true) {this.authenticated=authenticated}
  readonly concurrency=4
  private key(id:number,size:ThumbnailSize){return `${id}:${size}`}
  snapshot=(id:number,size:ThumbnailSize)=>this.entries.get(this.key(id,size))?.state??LOADING
  private emit(entry:Entry,state:ThumbnailState){entry.state=state;entry.listeners.forEach(listener=>listener())}
  subscribe=(id:number,size:ThumbnailSize,listener:()=>void)=>{
    const key=this.key(id,size)
    let entry=this.entries.get(key)
    if(entry&&!entry.listeners.size&&Date.now()-entry.used>=60000){entry.controller.abort();if(entry.state.url)URL.revokeObjectURL(entry.state.url);this.entries.delete(key);entry=undefined}
    if(!entry){entry={id,size,state:LOADING,controller:new AbortController(),listeners:new Set(),running:false,queued:true,used:Date.now(),attempt:0};if([...this.entries.values()].filter(e=>e.queued||e.running||e.timer).length>=128){entry.queued=false;entry.state={status:'error',error:'缩略图队列繁忙，请重试'}}if(!this.authenticated){entry.queued=false;entry.state={status:'error',error:'请先登录'}}this.entries.set(key,entry)}
    entry.listeners.add(listener);entry.used=Date.now()
    if(entry.blob&&!entry.state.url)this.emit(entry,{status:'ready',url:URL.createObjectURL(entry.blob)})
    this.pump();this.trim()
    const owned=entry
    return ()=>{
      owned.listeners.delete(listener);owned.used=Date.now()
      if(!owned.listeners.size){
        if(owned.state.url){URL.revokeObjectURL(owned.state.url);owned.state={status:'ready'}}
        if(owned.queued||owned.running||owned.timer){clearTimeout(owned.timer);owned.controller.abort();if(this.entries.get(key)===owned)this.entries.delete(key)}
        this.trim()
      }
    }
  }
  retry=(id:number,size:ThumbnailSize)=>{
    const entry=this.entries.get(this.key(id,size))
    if(!entry||entry.state.status!=='error')return
    entry.controller=new AbortController();entry.queued=true;entry.attempt=0;this.emit(entry,LOADING);this.pump()
  }
  private pump(){
    if(this.disposed||!this.authenticated)return
    for(const entry of this.entries.values()){
      if(this.active>=this.concurrency)break
      if(!entry.queued||!entry.listeners.size||entry.running)continue
      entry.queued=false;entry.running=true;this.active++
      void loadThumbnail(entry.id,entry.size,entry.controller.signal).then(blob=>{
        if(this.disposed||this.entries.get(this.key(entry.id,entry.size))!==entry||entry.controller.signal.aborted)return
        entry.blob=blob;entry.used=Date.now()
        this.emit(entry,{status:'ready',url:entry.listeners.size?URL.createObjectURL(blob):undefined})
      }).catch(error=>{
        if(this.disposed||entry.controller.signal.aborted)return
        if(axios.isAxiosError(error)&&error.response?.status===429&&entry.attempt<2&&entry.listeners.size){
          entry.attempt++;entry.timer=setTimeout(()=>{entry.timer=undefined;entry.queued=true;this.pump()},350*entry.attempt)
        }else this.emit(entry,{status:'error',error:axios.isAxiosError(error)&&error.response?.status===403?'没有权限读取这张照片':'缩略图加载失败'})
      }).finally(()=>{entry.running=false;this.active--;this.trim();this.pump()})
    }
  }
  private trim(){
    let bytes=[...this.entries.values()].reduce((sum,e)=>sum+(e.blob?.size??0),0)
    const unused=[...this.entries.entries()].filter(([,e])=>!e.listeners.size).sort((a,b)=>a[1].used-b[1].used)
    for(const [key,entry] of unused){
      if(this.entries.size<=96&&bytes<=24*1024*1024&&Date.now()-entry.used<60000)break
      if(entry.state.url)URL.revokeObjectURL(entry.state.url)
      clearTimeout(entry.timer);entry.controller.abort();bytes-=entry.blob?.size??0;this.entries.delete(key)
    }
  }
  activate=()=>{this.disposed=false;this.pump()}
  dispose=()=>{
    this.disposed=true
    for(const entry of this.entries.values()){clearTimeout(entry.timer);entry.controller.abort();if(entry.state.url)URL.revokeObjectURL(entry.state.url);entry.state=LOADING}
    this.entries.clear()
  }
}
