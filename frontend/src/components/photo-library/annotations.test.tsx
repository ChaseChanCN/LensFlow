import {act,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider,useQuery,type InfiniteData} from '@tanstack/react-query'
import {beforeEach,expect,it,vi} from 'vitest'
import type {ReactNode} from 'react'
import type {PhotoAsset,CatalogPage} from '@/api/photoCatalog'
import {batchAnnotations,readAnnotation,annotationDto} from '@/api/photoAnnotations'
import {useAnnotations,assetAnnotation} from './useAnnotations'
import {selectAsset,reconcileSelection} from './selection'
import {AnnotationControls} from './AnnotationControls'
import {catalogKey} from './usePhotoCatalog'
vi.mock('@/api/photoAnnotations',async original=>({...await original<typeof import('@/api/photoAnnotations')>(),batchAnnotations:vi.fn(),readAnnotation:vi.fn()}))
const photo=(id:number):PhotoAsset=>({id,orderId:1,filename:`${id}.jpg`,mimeType:'image/jpeg',width:50,height:60,sizeBytes:1,createdAt:'2026-10-17T00:00:00Z',displayAspectRatio:5/6,rating:0,colorLabel:'green',pickStatus:'pick',annotationRevision:0})
let client:QueryClient
beforeEach(()=>{vi.clearAllMocks();client=new QueryClient({defaultOptions:{queries:{retry:false}}})})
function setup(count=3){
 const key=catalogKey(1,1);client.setQueryData(key,{pages:[{items:Array.from({length:count},(_,i)=>photo(i+1)),nextCursor:null,hasMore:false}],pageParams:[null]})
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>
 return renderHook(()=>{const {data}=useQuery<InfiniteData<CatalogPage>>({queryKey:key,queryFn:async()=>{throw Error('must not refetch')},enabled:false});return useAnnotations(1,1,data!.pages.flatMap(p=>p.items))},{wrapper})
}
const cached=(id:number)=>client.getQueryData<InfiniteData<CatalogPage>>(catalogKey(1,1))!.pages[0].items.find(a=>a.id===id)!
function success(){vi.mocked(batchAnnotations).mockImplementation(async(items,changes)=>items.map(i=>({photoId:i.photoId,status:'success',annotation:{...assetAnnotation(cached(i.photoId)),...changes,revision:i.revision+1}})))}
it('strictly adapts default and populated annotations',()=>{
 expect(annotationDto({photo_id:1,rating:0,color_label:null,pick_status:'unmarked',revision:0})).toEqual({photoId:1,rating:0,colorLabel:null,pickStatus:'unmarked',revision:0})
 for(const value of [true,'5',6,-1])expect(()=>annotationDto({photo_id:1,rating:value,color_label:null,pick_status:'unmarked',revision:0})).toThrow()
})
it('selects stable IDs using loaded order, toggles and ranges independent from virtual DOM',()=>{
 const ids=Array.from({length:1000},(_,i)=>i+1),plain={ctrlKey:false,metaKey:false,shiftKey:false}
 let state=selectAsset(new Set(),ids,5,null,plain)
 state=selectAsset(state.selected,ids,900,state.anchor,{...plain,metaKey:true})
 expect([...state.selected]).toEqual([5,900])
 state=selectAsset(state.selected,ids,910,900,{...plain,shiftKey:true})
 expect(state.selected.size).toBe(11);expect(state.selected.has(905)).toBe(true)
 expect([...reconcileSelection(state.selected,[900,910])]).toEqual([900,910])
 expect(selectAsset(state.selected,ids,900,900,{...plain,ctrlKey:true}).selected.has(900)).toBe(false)
})
it('direct controls preserve photo neutrality and never bubble open/selection clicks',()=>{
 const open=vi.fn(),change=vi.fn()
 render(<div onClick={open}><AnnotationControls label="A" value={photo(1)} onChange={change}/></div>)
 fireEvent.click(screen.getByLabelText('A评分'));fireEvent.change(screen.getByLabelText('A评分'),{target:{value:'5'}})
 expect(change).toHaveBeenCalledWith({rating:5});expect(open).not.toHaveBeenCalled()
 expect(screen.getByLabelText('A颜色')).toHaveValue('green');expect(screen.getByLabelText('A标记')).toHaveValue('pick')
})
it('optimistically patches only fields and chunks 205 writes into 100/100/5 without refetch',async()=>{
 success();const hook=setup(205)
 await act(()=>hook.result.current.apply(Array.from({length:205},(_,i)=>i+1),{rating:5}))
 expect(vi.mocked(batchAnnotations).mock.calls.map(c=>c[0].length)).toEqual([100,100,5])
 expect(cached(205)).toMatchObject({rating:5,colorLabel:'green',pickStatus:'pick',annotationRevision:1})
 expect(hook.result.current.issues).toHaveLength(0);hook.unmount()
})
it('blocks duplicate pending operations and ignores a response older than cached revision',async()=>{
 const hook=setup();let finish!:(value:Awaited<ReturnType<typeof batchAnnotations>>)=>void
 vi.mocked(batchAnnotations).mockReturnValue(new Promise(resolve=>{finish=resolve}))
 let pending!:Promise<void>;act(()=>{pending=hook.result.current.apply([1],{rating:5})});await waitFor(()=>expect(batchAnnotations).toHaveBeenCalledOnce())
 expect(cached(1).rating).toBe(5);expect(hook.result.current.busy).toBe(true)
 await act(()=>hook.result.current.apply([1],{rating:2}));expect(batchAnnotations).toHaveBeenCalledOnce()
 client.setQueryData<InfiniteData<CatalogPage>>(catalogKey(1,1),data=>({...data!,pages:[{...data!.pages[0],items:[{...photo(1),rating:3,annotationRevision:8},photo(2),photo(3)]}]}))
 await act(async()=>{finish([{photoId:1,status:'success',annotation:{...assetAnnotation(photo(1)),rating:5,revision:1}}]);await pending})
 expect(cached(1)).toMatchObject({rating:3,annotationRevision:8});hook.unmount()
})
it('reconciles partial conflicts then requires explicit refreshed-revision retry',async()=>{
 const hook=setup();vi.mocked(batchAnnotations).mockResolvedValueOnce([{photoId:1,status:'success',annotation:{...assetAnnotation(photo(1)),rating:5,revision:1}},{photoId:2,status:'conflict',annotation:{...assetAnnotation(photo(2)),rating:2,revision:7}}])
 await act(()=>hook.result.current.apply([1,2],{rating:5}))
 expect(cached(1).rating).toBe(5);expect(cached(2).rating).toBe(2);expect(hook.result.current.issues[0].id).toBe(2)
 vi.mocked(readAnnotation).mockResolvedValue({...assetAnnotation(photo(2)),rating:2,revision:8});success()
 act(()=>hook.result.current.retry());await waitFor(()=>expect(hook.result.current.busy).toBe(false))
 expect(batchAnnotations).toHaveBeenLastCalledWith([{photoId:2,revision:8}],{rating:5});expect(cached(1).annotationRevision).toBe(1);hook.unmount()
})
it('rolls back uncertain network outcomes and never automatically repeats writes',async()=>{
 const hook=setup();vi.mocked(batchAnnotations).mockRejectedValue(Error('network'))
 await act(()=>hook.result.current.apply([1,2],{colorLabel:'red'}))
 expect(cached(1).colorLabel).toBe('green');expect(cached(2).colorLabel).toBe('green');expect(batchAnnotations).toHaveBeenCalledOnce()
 expect(hook.result.current.issues).toHaveLength(2);expect(readAnnotation).not.toHaveBeenCalled();hook.unmount()
})
it('persistent writes survive component disposal and only update their captured order cache',async()=>{
 const hook=setup();let finish!:(value:Awaited<ReturnType<typeof batchAnnotations>>)=>void
 vi.mocked(batchAnnotations).mockReturnValue(new Promise(resolve=>{finish=resolve}))
 let pending!:Promise<void>;act(()=>{pending=hook.result.current.apply([1],{rating:4})});await waitFor(()=>expect(batchAnnotations).toHaveBeenCalledOnce())
 client.setQueryData(catalogKey(1,2),{pages:[{items:[{...photo(1),orderId:2}],nextCursor:null,hasMore:false}],pageParams:[null]});hook.unmount()
 await act(async()=>{finish([{photoId:1,status:'success',annotation:{...assetAnnotation(photo(1)),rating:4,revision:1}}]);await pending})
 expect(cached(1).rating).toBe(4);expect(client.getQueryData<InfiniteData<CatalogPage>>(catalogKey(1,2))!.pages[0].items[0].rating).toBe(0)
})


it('keeps the order write scope locked when leaving and re-entering before acknowledgement',async()=>{
 const first=setup();let finish!:(value:Awaited<ReturnType<typeof batchAnnotations>>)=>void
 vi.mocked(batchAnnotations).mockReturnValue(new Promise(resolve=>{finish=resolve}))
 let pending!:Promise<void>;act(()=>{pending=first.result.current.apply([1],{rating:5})});await waitFor(()=>expect(batchAnnotations).toHaveBeenCalledOnce());first.unmount()
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>
 const second=renderHook(()=>useAnnotations(1,1,[cached(1),cached(2),cached(3)]),{wrapper})
 expect(second.result.current.busy).toBe(true)
 await act(()=>second.result.current.apply([1],{rating:2}));expect(batchAnnotations).toHaveBeenCalledOnce()
 await act(async()=>{finish([{photoId:1,status:'success',annotation:{...assetAnnotation(photo(1)),rating:5,revision:1}}]);await pending})
 expect(second.result.current.busy).toBe(false);expect(cached(1).rating).toBe(5);second.unmount()
})
