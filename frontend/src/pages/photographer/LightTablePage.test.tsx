import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom'
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {loadAsset,type PhotoAsset} from '@/api/photoCatalog'
import {loadPhotoPreview} from '@/api/imageEdit'
import {decodePhoto} from '@/components/photo-editor/imageResource'
import {batchAnnotations} from '@/api/photoAnnotations'
import {useAuthStore} from '@/stores/auth'
import {LightTablePage} from './LightTablePage'
vi.mock('@/api/photoCatalog',()=>({loadAsset:vi.fn()}))
vi.mock('@/api/imageEdit',()=>({loadPhotoPreview:vi.fn(),getPreviewSourceHash:vi.fn(),getPreviewSourceSize:vi.fn(),imageErrorMessage:vi.fn(()=> '照片不可用')}))
vi.mock('@/components/photo-editor/imageResource',()=>({decodePhoto:vi.fn()}))
vi.mock('@/api/photoAnnotations',()=>({batchAnnotations:vi.fn(),readAnnotation:vi.fn()}))
vi.mock('@/components/Layout',()=>({Layout:({children}:{children:React.ReactNode})=><>{children}</>}))
const asset=(id:number):PhotoAsset=>({id,orderId:1,filename:`p${id}.jpg`,mimeType:'image/jpeg',width:id===1?800:400,height:id===1?400:800,sizeBytes:1000,createdAt:'2026-10-17T00:00:00Z',displayAspectRatio:id===1?2:.5,rating:0,colorLabel:null,pickStatus:'unmarked',annotationRevision:0})
let client:QueryClient
let dispose=vi.fn<()=>void>()
function Location(){const navigate=useNavigate();return <><p data-testid="location">{useLocation().pathname+useLocation().search}</p><button onClick={()=>navigate('/orders/1/light-table?a=3&b=4')}>切换比较目标测试</button></>}
function show(url='/orders/1/light-table?a=1&b=2&library=rating_min%3D4'){
 client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Location/><Routes><Route path="/orders/:id/light-table" element={<LightTablePage/>}/><Route path="/orders/:id/library" element={<p>返回了图库</p>}/><Route path="/orders/:id/photos/:photoId/edit" element={<p>打开了编辑器</p>}/></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(()=>{
 vi.clearAllMocks();dispose=vi.fn();useAuthStore.setState({user:{id:1,email:'p@test',name:'P',role:'photographer',created_at:''},token:'test',isAuthenticated:true})
 vi.mocked(loadAsset).mockImplementation(async(_order,id)=>asset(id));vi.mocked(loadPhotoPreview).mockResolvedValue(new Blob(['jpeg'],{type:'image/jpeg'}))
 let decoded=0;vi.mocked(decodePhoto).mockImplementation(async()=>{decoded++;return {width:decoded===1?800:400,height:decoded===1?400:800,image:{} as ImageBitmap,dispose}})
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D)
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(600);vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(400)
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}unobserve(){}})
})
afterEach(()=>{client?.clear();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('loads exactly two authenticated previews and releases bitmaps on Escape return with filters',async()=>{
 show();expect(await screen.findByRole('img',{name:'A原始照片预览'})).toBeInTheDocument();expect(await screen.findByRole('img',{name:'B原始照片预览'})).toBeInTheDocument()
 expect(loadPhotoPreview).toHaveBeenCalledTimes(2)
 fireEvent.keyDown(screen.getByRole('group',{name:'A照片视口'}),{key:'Escape'})
 expect(await screen.findByText('返回了图库')).toBeInTheDocument();expect(screen.getByTestId('location')).toHaveTextContent('/orders/1/library?rating_min=4');expect(dispose).toHaveBeenCalledTimes(2)
})
it('independently zooms then synchronizes normalized zoom/pan across different aspect ratios',async()=>{
 show();await screen.findByRole('img',{name:'B原始照片预览'})
 const a=screen.getByRole('group',{name:'A照片视口'}),b=screen.getByRole('group',{name:'B照片视口'})
 fireEvent.click(screen.getByRole('button',{name:'A放大'}));expect(a).toHaveAttribute('data-zoom','1.25');expect(b).toHaveAttribute('data-zoom','1')
 fireEvent.wheel(a,{deltaY:-600});expect(Number(a.getAttribute('data-zoom'))).toBeGreaterThan(2)
 fireEvent.click(screen.getByLabelText('同步缩放与平移'));fireEvent.keyDown(a,{key:'+'})
 expect(a.getAttribute('data-zoom')).toBe(b.getAttribute('data-zoom'))
 fireEvent.keyDown(a,{key:'ArrowRight'});expect(Number(a.getAttribute('data-center-x'))).toBeGreaterThan(.5)
 expect(Number(b.getAttribute('data-center-x'))).toBeGreaterThanOrEqual(.5)
 fireEvent.keyDown(a,{key:'f'});expect(a).toHaveAttribute('data-zoom','1');expect(b).toHaveAttribute('data-zoom','1')
 fireEvent.click(screen.getByLabelText('同步缩放与平移'));fireEvent.click(screen.getByRole('button',{name:'B放大'}));expect(a).toHaveAttribute('data-zoom','1');expect(b).toHaveAttribute('data-zoom','1.25')
})
it('rates only the focused panel, suppresses form shortcuts, and preserves context into editor',async()=>{
 vi.mocked(batchAnnotations).mockImplementation(async(items,changes)=>items.map(i=>({photoId:i.photoId,status:'success',annotation:{photoId:i.photoId,rating:0,colorLabel:null,pickStatus:'unmarked',...changes,revision:i.revision+1}})))
 show();await screen.findByRole('img',{name:'B原始照片预览'});const b=screen.getByRole('group',{name:'B照片视口'})
 fireEvent.focus(b);fireEvent.keyDown(b,{key:'5'});await waitFor(()=>expect(batchAnnotations).toHaveBeenCalledWith([{photoId:2,revision:0}],{rating:5}))
 await waitFor(()=>expect(screen.getByLabelText('B p2.jpg评分')).toHaveValue('5'))
 fireEvent.keyDown(screen.getByLabelText('B p2.jpg评分'),{key:'3'});expect(batchAnnotations).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:'编辑这张照片（B）'}));expect(screen.getByTestId('location')).toHaveTextContent('from=library&library=rating_min%3D4&compare=1%2C2')
})
it('rejects invalid comparison targets and surfaces authorized metadata failures without image leakage',async()=>{
 const view=show('/orders/1/light-table?a=1&b=1');expect(await screen.findByText(/灯箱需要当前订单/)).toBeInTheDocument();expect(loadPhotoPreview).not.toHaveBeenCalled();view.unmount();client.clear()
 vi.mocked(loadAsset).mockRejectedValue(Error('403'));show();expect(await screen.findByText('A：照片不可用')).toBeInTheDocument();expect(loadPhotoPreview).not.toHaveBeenCalled()
})
it('aborts pending previews and ignores late decoded resources after comparison closes',async()=>{
 let finish!:(blob:Blob)=>void;vi.mocked(loadPhotoPreview).mockResolvedValueOnce(new Blob(['jpeg'])).mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
 const view=show();await screen.findByRole('img',{name:'A原始照片预览'});await waitFor(()=>expect(loadPhotoPreview).toHaveBeenCalledTimes(2));const signal=vi.mocked(loadPhotoPreview).mock.calls[1][1]
 view.unmount();expect(signal.aborted).toBe(true);await act(async()=>finish(new Blob(['late'])));expect(decodePhoto).toHaveBeenCalledTimes(1);expect(dispose).toHaveBeenCalledOnce()
})

it('starts B only after A decode settles, respecting the existing single render slot',async()=>{
 let finish!:(blob:Blob)=>void;vi.mocked(loadPhotoPreview).mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce(new Blob(['jpeg']))
 show();await waitFor(()=>expect(loadPhotoPreview).toHaveBeenCalledTimes(1));expect(screen.getByRole('status',{name:'B 等待 A 预览完成'})).toBeInTheDocument()
 await act(async()=>finish(new Blob(['jpeg'])));expect(await screen.findByRole('img',{name:'B原始照片预览'})).toBeInTheDocument();expect(loadPhotoPreview).toHaveBeenCalledTimes(2)
})

it('releases old target requests and never decodes a late response after changing the comparison pair',async()=>{
 let finish!:(blob:Blob)=>void;vi.mocked(loadPhotoPreview).mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValue(new Blob(['jpeg']))
 const view=show();await waitFor(()=>expect(loadPhotoPreview).toHaveBeenCalledTimes(1));const oldSignal=vi.mocked(loadPhotoPreview).mock.calls[0][1]
 fireEvent.click(screen.getByText('切换比较目标测试'));await screen.findByRole('img',{name:'B原始照片预览'});expect(oldSignal.aborted).toBe(true)
 expect(screen.getByRole('group',{name:'A照片视口'})).toHaveAttribute('data-photo-id','3')
 await act(async()=>finish(new Blob(['late'])));expect(decodePhoto).toHaveBeenCalledTimes(2)
 const canvas=screen.getByRole('img',{name:'A原始照片预览'}) as HTMLCanvasElement
 view.unmount();expect(canvas.width).toBe(0);expect(canvas.height).toBe(0);expect(dispose).toHaveBeenCalledTimes(2)
})
