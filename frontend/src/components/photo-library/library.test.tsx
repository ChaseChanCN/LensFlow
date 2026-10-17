import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter,Route,Routes } from 'react-router-dom'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { useState } from 'react'
import { loadCatalog,loadThumbnail,type PhotoAsset } from '@/api/photoCatalog'
import { usePhotoCatalog } from './usePhotoCatalog'
import { AssetGrid } from './AssetGrid'
import { ThumbnailPool } from './ThumbnailPool'
import { PhotoViewer } from './PhotoViewer'
import { usePhotoResource } from '@/components/photo-editor/usePhotoResource'
vi.mock('@/api/photoCatalog',()=>({loadCatalog:vi.fn(),loadThumbnail:vi.fn()}))
vi.mock('@/components/photo-editor/usePhotoResource',()=>({usePhotoResource:vi.fn()}))
const assets=(count:number,orderId=1,start=1):PhotoAsset[]=>Array.from({length:count},(_,i)=>({id:start+i,orderId,filename:`real-${start+i}.jpg`,mimeType:'image/jpeg',width:517,height:606,sizeBytes:50000,createdAt:'2026-10-17T00:00:00Z',rating:0,colorLabel:null,pickStatus:'unmarked' as const,annotationRevision:0,displayAspectRatio:517/606}))
let pool:ThumbnailPool
beforeEach(()=>{
  vi.clearAllMocks();pool=new ThumbnailPool()
  vi.mocked(loadThumbnail).mockResolvedValue(new Blob(['jpeg'],{type:'image/jpeg'}))
  vi.mocked(usePhotoResource).mockReturnValue({photoId:1,attempt:0,resource:undefined,error:undefined,retry:vi.fn()})
  vi.stubGlobal('URL',class extends URL{static createObjectURL=vi.fn(()=>`blob:photo`);static revokeObjectURL=vi.fn()})
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(960)
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:960,height:500,top:0,left:0,bottom:500,right:960,x:0,y:0,toJSON(){}})
  vi.stubGlobal('ResizeObserver',class{callback:ResizeObserverCallback;constructor(callback:ResizeObserverCallback){this.callback=callback}observe(element:Element){this.callback([{target:element,contentRect:{width:960,height:500},borderBoxSize:[{inlineSize:960,blockSize:500}]}] as unknown as ResizeObserverEntry[],this as unknown as ResizeObserver)}unobserve(){}disconnect(){}})
  Element.prototype.scrollTo=vi.fn(function(this:HTMLElement,options?:ScrollToOptions|number,y?:number){this.scrollTop=typeof options==='number'?(y??0):(options?.top??0);this.dispatchEvent(new Event('scroll'))})
})
afterEach(()=>{pool.dispose();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('uses the real virtualizer to bound 1000 cards and preserve geometry through density changes',async()=>{
  const state=vi.fn(),open=vi.fn()
  render(<AssetGrid items={assets(1000)} pool={pool} onOpen={open} hasMore={false} fetching={false} onMore={vi.fn()} initial={{offset:0,density:'normal',focusedId:null}} onViewState={state}/>)
  const grid=screen.getByRole('grid',{name:'照片图库'})
  expect(grid.querySelectorAll('[data-photo-card]').length).toBeGreaterThan(0)
  expect(grid.querySelectorAll('[data-photo-card]').length).toBeLessThan(60)
  expect(grid.querySelector('[data-photo-id="1000"]')).toBeNull()
  fireEvent.change(screen.getByLabelText('网格密度'),{target:{value:'compact'}})
  expect(grid.getAttribute('aria-colcount')).toBe('6')
  expect(grid.querySelectorAll('[data-photo-card]').length).toBeLessThan(100)
  fireEvent.keyDown(grid,{key:'ArrowRight'})
  expect(grid.querySelector('[data-photo-id="2"]')).toHaveAttribute('data-focused','true')
  fireEvent.click(screen.getByRole('button',{name:'查看 real-2.jpg'}));expect(open).toHaveBeenCalledWith(expect.objectContaining({id:2}))
  await waitFor(()=>expect(loadThumbnail).toHaveBeenCalled())
})
function Pages({order}:{order:number}){
  const query=usePhotoCatalog(1,order)
  return <><p>{query.data?.pages.flatMap(page=>page.items).map(p=>p.filename).join(',')??'loading'}</p><button onClick={()=>{void query.fetchNextPage({cancelRefetch:false});void query.fetchNextPage({cancelRefetch:false})}}>more</button></>
}
it('deduplicates the same cursor fetch and ignores old order responses',async()=>{
  let finish!: (page:{items:PhotoAsset[];nextCursor:null;hasMore:false})=>void
  vi.mocked(loadCatalog).mockResolvedValueOnce({items:assets(1),nextCursor:'cursor',hasMore:true}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce({items:assets(1,2,22),nextCursor:null,hasMore:false})
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  const view=render(<QueryClientProvider client={client}><Pages order={1}/></QueryClientProvider>)
  expect(await screen.findByText('real-1.jpg')).toBeInTheDocument()
  fireEvent.click(screen.getByText('more'));expect(loadCatalog).toHaveBeenCalledTimes(2)
  const signal=vi.mocked(loadCatalog).mock.calls[1][2]
  view.rerender(<QueryClientProvider client={client}><Pages order={2}/></QueryClientProvider>)
  expect(await screen.findByText('real-22.jpg')).toBeInTheDocument();expect(signal.aborted).toBe(true)
  await act(async()=>finish({items:assets(1,1,2),nextCursor:null,hasMore:false}))
  expect(screen.queryByText('real-2.jpg')).not.toBeInTheDocument();view.unmount();client.clear()
})
it('viewer navigates only loaded photos, edits the right asset, and Escape closes',async()=>{
  const close=vi.fn(),edit=vi.fn()
  function Viewer(){const[id,setId]=useState(1);return <PhotoViewer items={assets(3)} id={id} onSelect={setId} onClose={close} onEdit={edit}/>}
  render(<MemoryRouter><Routes><Route path="/" element={<Viewer/>}/></Routes></MemoryRouter>)
  expect(screen.getByRole('dialog')).toHaveAccessibleName('real-1.jpg')
  expect(screen.getByRole('button',{name:'上一张'})).toBeDisabled()
  fireEvent.click(screen.getByText('下一张'))
  expect(screen.getByRole('dialog')).toHaveAccessibleName('real-2.jpg')
  fireEvent.click(screen.getByText('编辑照片'));expect(edit).toHaveBeenCalledWith(expect.objectContaining({id:2}))
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(close).toHaveBeenCalledOnce()
})

it('scopes shortcuts to the grid, suppresses controls/dialogs and preserves selection on density changes',async()=>{
 const select=vi.fn(),write=vi.fn(),open=vi.fn(),selected=new Set([1,7])
 const view=render(<AssetGrid items={assets(1000)} pool={pool} onOpen={open} hasMore={false} fetching={false} onMore={vi.fn()} initial={{offset:0,density:'normal',focusedId:null}} onViewState={vi.fn()} selected={selected} onSelect={select} onMetadata={write}/>)
 const grid=screen.getByRole('grid',{name:'照片图库'})
 fireEvent.click(grid.querySelector('[data-photo-id="1"] .asset-image')!,{ctrlKey:true})
 expect(select).toHaveBeenCalledWith(1,expect.objectContaining({ctrlKey:true}));expect(open).not.toHaveBeenCalled()
 fireEvent.click(grid.querySelector('[data-photo-id="7"] .asset-image')!,{shiftKey:true})
 expect(select).toHaveBeenLastCalledWith(7,expect.objectContaining({shiftKey:true}))
 fireEvent.keyDown(grid,{key:'5'});expect(write).toHaveBeenLastCalledWith([1,7],{rating:5})
 fireEvent.keyDown(grid,{key:'p'});expect(write).toHaveBeenLastCalledWith([1,7],{pickStatus:'pick'})
 fireEvent.keyDown(grid,{key:'x'});expect(write).toHaveBeenLastCalledWith([1,7],{pickStatus:'reject'})
 fireEvent.keyDown(grid,{key:'u'});expect(write).toHaveBeenLastCalledWith([1,7],{pickStatus:'unmarked'})
 fireEvent.keyDown(grid,{key:'a',metaKey:true});expect(select).toHaveBeenLastCalledWith(-1,expect.anything())
 fireEvent.keyDown(grid,{key:'Escape'});expect(select).toHaveBeenLastCalledWith(-2,expect.anything())
 const count=write.mock.calls.length
 fireEvent.keyDown(screen.getByLabelText('real-1.jpg评分'),{key:'3'});expect(write).toHaveBeenCalledTimes(count)
 const dialog=document.createElement('div');dialog.setAttribute('role','dialog');document.body.append(dialog)
 fireEvent.keyDown(grid,{key:'4'});expect(write).toHaveBeenCalledTimes(count);dialog.remove()
 fireEvent.change(screen.getByLabelText('网格密度'),{target:{value:'compact'}})
 expect(grid.querySelector('[data-photo-id="1"]')).toHaveAttribute('aria-selected','true')
 expect(grid.querySelectorAll('[data-photo-card]').length).toBeLessThan(100)
 view.unmount()
})
