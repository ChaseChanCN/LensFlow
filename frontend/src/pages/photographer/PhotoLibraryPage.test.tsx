import { fireEvent,render,screen } from '@testing-library/react'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter,Route,Routes } from 'react-router-dom'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { loadCatalog } from '@/api/photoCatalog'
import { useAuthStore } from '@/stores/auth'
import { PhotoLibraryPage } from './PhotoLibraryPage'
vi.mock('@/api/photoCatalog',()=>({loadCatalog:vi.fn(),loadThumbnail:vi.fn()}))
vi.mock('@/components/photo-library/MetadataTools',()=>({MetadataTools:()=>null}))
vi.mock('@/components/Layout',()=>({Layout:({children}:{children:React.ReactNode})=><>{children}</>}))
vi.mock('@/components/photo-library/AssetGrid',()=>({AssetGrid:({items,onMore,onOpen}:{items:{id:number;filename:string}[];onMore:()=>void;onOpen:(item:{id:number;filename:string})=>void})=><div><p>图库 {items.length} 张</p><button onClick={onMore}>滚动到下一页</button><button onClick={()=>onOpen(items[0])}>打开首图</button></div>}))
vi.mock('@/components/photo-library/PhotoViewer',()=>({PhotoViewer:({id,onClose,onEdit,items}:{id:number;onClose:()=>void;onEdit:(asset:{id:number;filename:string})=>void;items:{id:number;filename:string}[]})=><div role="dialog"><p>查看 {id}</p><button onClick={onClose}>关闭查看器</button><button onClick={()=>onEdit(items[0])}>编辑照片</button></div>}))
const asset={id:1,orderId:1,filename:'real.jpg',mimeType:'image/jpeg',width:517,height:606,sizeBytes:1000,createdAt:'2026-10-17T00:00:00Z',rating:0,colorLabel:null,pickStatus:'unmarked' as const,annotationRevision:0,displayAspectRatio:517/606}
let query:QueryClient
function show(){query=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={query}><MemoryRouter initialEntries={['/orders/1/library']}><Routes><Route path="/orders/:id/library" element={<PhotoLibraryPage/>}/><Route path="/orders/:id/photos/:photoId/edit" element={<p>编辑路由已打开</p>}/></Routes></MemoryRouter></QueryClientProvider>)}
beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({user:{id:1,email:'p@test.com',name:'P',role:'photographer',created_at:''},token:'test',isAuthenticated:true})})
afterEach(()=>query?.clear())
it('distinguishes empty catalog from loading and failures',async()=>{
  vi.mocked(loadCatalog).mockResolvedValue({items:[],nextCursor:null,hasMore:false})
  show();expect(await screen.findByText('暂无照片')).toBeInTheDocument();expect(screen.queryByText('下一页加载失败')).not.toBeInTheDocument()
})
it('preserves prior pages through next-page errors and retries explicitly',async()=>{
  vi.mocked(loadCatalog).mockResolvedValueOnce({items:[asset],nextCursor:'next',hasMore:true}).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({items:[{...asset,id:2}],nextCursor:null,hasMore:false})
  show();expect(await screen.findByText('图库 1 张')).toBeInTheDocument()
  fireEvent.click(screen.getByText('滚动到下一页'))
  expect(await screen.findByRole('alert')).toHaveTextContent('下一页加载失败')
  expect(screen.getByText('图库 1 张')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'重试下一页'}));expect(await screen.findByText('图库 2 张')).toBeInTheDocument()
  fireEvent.click(screen.getByText('打开首图'));expect(screen.getByRole('dialog')).toHaveTextContent('查看 1')
  fireEvent.click(screen.getByText('编辑照片'));expect(await screen.findByText('编辑路由已打开')).toBeInTheDocument()
})
