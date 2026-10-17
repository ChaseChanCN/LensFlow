import { beforeEach,expect,it,vi } from 'vitest'
import client from './client'
import { photoAsset,loadCatalog,loadThumbnail,loadAsset } from './photoCatalog'
vi.mock('./client',()=>({default:{get:vi.fn()}}))
const raw={id:1,order_id:2,filename:'real.jpg',mime:'image/jpeg',width:517,height:606,size_bytes:512,created_at:'2026-10-17T00:00:00Z'}
beforeEach(()=>vi.clearAllMocks())
it('adapts only real metadata and never carries storage keys or invented EXIF',()=>{
  const result=photoAsset({...raw,storage_key:'private'})
  expect(result).toEqual({id:1,orderId:2,filename:'real.jpg',mimeType:'image/jpeg',width:517,height:606,sizeBytes:512,createdAt:raw.created_at,rating:0,colorLabel:null,pickStatus:'unmarked',annotationRevision:0,displayAspectRatio:517/606})
  expect(photoAsset({...raw,width:null,height:null}).displayAspectRatio).toBeNull()
  for(const input of [{...raw,id:'1'},{...raw,size_bytes:-1},{...raw,width:0},{...raw,created_at:'no'}])expect(()=>photoAsset(input)).toThrow()
})
it('uses authenticated catalog/asset clients and sends only the current cursor',async()=>{
  const signal=new AbortController().signal
  vi.mocked(client.get).mockResolvedValueOnce({data:{items:[raw],has_more:true,next_cursor:'signed'}}).mockResolvedValueOnce({data:{items:[],has_more:false,next_cursor:null}})
  expect((await loadCatalog(2,null,signal)).nextCursor).toBe('signed')
  expect((await loadCatalog(2,'signed',signal)).hasMore).toBe(false)
  expect(client.get).toHaveBeenNthCalledWith(2,'/api/v1/orders/2/photos/catalog',{params:{limit:50,cursor:'signed'},signal})
  vi.mocked(client.get).mockResolvedValue({data:raw})
  expect((await loadAsset(2,1,signal)).id).toBe(1)
  await expect(loadAsset(9,1,signal)).rejects.toThrow()
})
it('rejects inconsistent pages and non-JPEG thumbnail responses',async()=>{
  const signal=new AbortController().signal
  vi.mocked(client.get).mockResolvedValueOnce({data:{items:[{...raw,order_id:99}],has_more:false,next_cursor:null}})
  await expect(loadCatalog(2,null,signal)).rejects.toThrow()
  vi.mocked(client.get).mockResolvedValueOnce({data:new Blob(['html'],{type:'text/html'})})
  await expect(loadThumbnail(1,256,signal)).rejects.toThrow()
  const jpeg=new Blob(['jpeg'],{type:'image/jpeg'})
  vi.mocked(client.get).mockResolvedValueOnce({data:jpeg})
  expect(await loadThumbnail(1,256,signal)).toBe(jpeg)
  expect(client.get).toHaveBeenLastCalledWith('/api/v1/photos/1/thumbnail',{params:{size:256},responseType:'blob',signal})
})
