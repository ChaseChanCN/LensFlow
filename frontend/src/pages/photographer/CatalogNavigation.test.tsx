import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom'
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {loadCatalog,type PhotoAsset} from '@/api/photoCatalog'
import {batchAnnotations} from '@/api/photoAnnotations'
import {useAuthStore} from '@/stores/auth'
import {PhotoLibraryPage} from './PhotoLibraryPage'
vi.mock('@/components/photo-library/MetadataTools',()=>({MetadataTools:()=>null}))
vi.mock('@/api/metadataOverlay',async original=>({...await original<typeof import('@/api/metadataOverlay')>(),keywordStatus:vi.fn().mockResolvedValue({total:0,indexed:0,unknown:0,complete:true,source_freshness:'verified_at_index_only'})}))
vi.mock('@/api/photoCatalog',()=>({loadCatalog:vi.fn(),loadThumbnail:vi.fn()}))
vi.mock('@/api/photoAnnotations',()=>({batchAnnotations:vi.fn(),readAnnotation:vi.fn()}))
vi.mock('@/components/Layout',()=>({Layout:({children}:{children:React.ReactNode})=><>{children}</>}))
vi.mock('@/components/photo-library/AssetGrid',()=>({AssetGrid:({items,onMetadata,onSelect}:{items:PhotoAsset[];onMetadata:(ids:number[],changes:{rating:number})=>void;onSelect:(id:number,event:{ctrlKey:boolean;shiftKey:boolean;metaKey:boolean})=>void})=><div data-testid="grid">{items.map(a=><span key={a.id}>{a.filename}:{a.rating};</span>)}<button onClick={()=>onMetadata([items[0].id],{rating:0})}>归零首图</button>{items.map(a=><button key={a.id} onClick={()=>onSelect(a.id,{ctrlKey:true,metaKey:false,shiftKey:false})}>选择{a.id}</button>)}</div>}))
const photo=(id:number,rating=4):PhotoAsset=>({id,orderId:1,filename:`p${id}`,mimeType:'image/jpeg',width:5,height:6,sizeBytes:1,createdAt:'2026-10-17T00:00:00Z',displayAspectRatio:5/6,rating,colorLabel:null,pickStatus:'pick',annotationRevision:0})
const page=(items:PhotoAsset[])=>({items,nextCursor:null,hasMore:false})
let client:QueryClient
function Location(){const location=useLocation(),navigate=useNavigate();return <><p data-testid="location">{location.pathname+location.search}</p><button onClick={()=>navigate(-1)}>后退测试</button><button onClick={()=>navigate(1)}>前进测试</button></>}
function show(url='/orders/1/library'){
 client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Location/><Routes><Route path="/orders/:id/library" element={<PhotoLibraryPage/>}/><Route path="/orders/:id/light-table" element={<p>灯箱路由</p>}/></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({user:{id:1,name:'P',email:'p@test',role:'photographer',created_at:''},token:'test',isAuthenticated:true})})
afterEach(()=>client?.clear())
it('restores URL conditions and browser Back/Forward while resetting filter sessions',async()=>{
 vi.mocked(loadCatalog).mockResolvedValue(page([photo(1)]));show('/orders/1/library?rating_min=4&pick=pick&sort=rating_desc')
 expect(await screen.findByTestId('grid')).toHaveTextContent('p1:4');expect(screen.getByLabelText('评分条件')).toHaveValue('min4');expect(screen.getByLabelText('筛选保留')).toBeChecked()
 expect(loadCatalog).toHaveBeenCalledWith(1,null,expect.any(AbortSignal),expect.objectContaining({ratingMin:4,sort:'rating_desc'}))
 fireEvent.change(screen.getByLabelText('评分条件'),{target:{value:'eq5'}});await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('rating=5'))
 fireEvent.click(screen.getByText('后退测试'));await waitFor(()=>expect(screen.getByLabelText('评分条件')).toHaveValue('min4'))
 fireEvent.click(screen.getByText('前进测试'));await waitFor(()=>expect(screen.getByLabelText('评分条件')).toHaveValue('eq5'))
})
it('cancels old filter requests and refuses stale responses into the new query key',async()=>{
 let finish!:(value:ReturnType<typeof page>)=>void
 vi.mocked(loadCatalog).mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValue(page([photo(2,5)]))
 show();await waitFor(()=>expect(loadCatalog).toHaveBeenCalledOnce());const signal=vi.mocked(loadCatalog).mock.calls[0][2]
 fireEvent.change(screen.getByLabelText('评分条件'),{target:{value:'eq5'}});expect(await screen.findByTestId('grid')).toHaveTextContent('p2:5');expect(signal.aborted).toBe(true)
 await act(async()=>finish(page([photo(1)])));expect(screen.getByTestId('grid')).not.toHaveTextContent('p1')
})
it('restarts filtered membership and rating ordering after a persistent annotation update',async()=>{
 vi.mocked(loadCatalog).mockResolvedValueOnce(page([photo(1)])).mockResolvedValue(page([]))
 vi.mocked(batchAnnotations).mockResolvedValue([{photoId:1,status:'success',annotation:{photoId:1,rating:0,colorLabel:null,pickStatus:'pick',revision:1}}])
 show('/orders/1/library?rating_min=4&sort=rating_desc');await screen.findByTestId('grid');fireEvent.click(screen.getByText('归零首图'))
 expect(await screen.findByText('没有符合条件的照片')).toBeInTheDocument();expect(loadCatalog).toHaveBeenCalledTimes(2)
 expect(vi.mocked(loadCatalog).mock.calls[1][1]).toBeNull()
})
it('opens exactly two selected IDs in the Light Table with canonical return context',async()=>{
 vi.mocked(loadCatalog).mockResolvedValue(page([photo(1),photo(2)]));show('/orders/1/library?sort=created_desc');await screen.findByTestId('grid')
 const compare=screen.getByRole('button',{name:'灯箱比较（选择两张）'});expect(compare).toBeDisabled();fireEvent.click(screen.getByText('选择1'));expect(compare).toBeDisabled();fireEvent.click(screen.getByText('选择2'));expect(compare).toBeEnabled();fireEvent.click(compare)
 expect(await screen.findByText('灯箱路由')).toBeInTheDocument();expect(screen.getByTestId('location')).toHaveTextContent('a=1&b=2&library=sort%3Dcreated_desc')
})
it('rejects invalid URL state and offers explicit reset without making a catalog request',async()=>{
 show('/orders/1/library?sort=unknown');expect(await screen.findByText('排序条件无效')).toBeInTheDocument();expect(loadCatalog).not.toHaveBeenCalled()
})

it('restarts rating sort and accepts the server reordered sequence after a rating change',async()=>{
 vi.mocked(loadCatalog).mockResolvedValueOnce(page([photo(1,5),photo(2,4)])).mockResolvedValue(page([photo(2,4),photo(1,0)]))
 vi.mocked(batchAnnotations).mockResolvedValue([{photoId:1,status:'success',annotation:{photoId:1,rating:0,colorLabel:null,pickStatus:'pick',revision:1}}])
 show('/orders/1/library?sort=rating_desc');await screen.findByTestId('grid');fireEvent.click(screen.getByText('归零首图'))
 await waitFor(()=>expect(screen.getByTestId('grid')).toHaveTextContent('p2:4;p1:0;'));expect(loadCatalog).toHaveBeenCalledTimes(2)
})
