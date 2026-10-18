import { useState } from 'react'
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { beforeEach,expect,it,vi } from 'vitest'
import { loadPhotoPreview } from '@/api/imageEdit'
import { decodePhoto,type PhotoResource } from '@/components/photo-editor/imageResource'
import { PhotoViewer } from './PhotoViewer'
vi.mock('@/api/imageEdit',()=>({loadPhotoPreview:vi.fn(),getPreviewSourceHash:vi.fn(()=>undefined),getPreviewSourceSize:vi.fn(()=>undefined),imageErrorMessage:vi.fn(()=> '照片不可用')}))
vi.mock('@/components/photo-editor/imageResource',()=>({decodePhoto:vi.fn()}))
const photo=(id:number)=>({id,orderId:1,filename:`${id}.jpg`,mimeType:'image/jpeg',width:517,height:606,sizeBytes:1000,createdAt:'2026-10-17T00:00:00Z',rating:0,colorLabel:null,pickStatus:'unmarked' as const,annotationRevision:0,displayAspectRatio:517/606})
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D)})
it('cancels old photos, ignores late responses and releases the active bitmap when viewer closes',async()=>{
  let resolveOld!:(blob:Blob)=>void
  const resource:PhotoResource={image:{} as ImageBitmap,width:517,height:606,dispose:vi.fn()}
  vi.mocked(loadPhotoPreview).mockReturnValueOnce(new Promise(resolve=>{resolveOld=resolve})).mockResolvedValueOnce(new Blob(['real-jpeg'],{type:'image/jpeg'}))
  vi.mocked(decodePhoto).mockResolvedValue(resource)
  function Harness(){const[id,setId]=useState(1),[open,setOpen]=useState(true);return open?<PhotoViewer id={id} items={[photo(1),photo(2)]} onSelect={setId} onClose={()=>setOpen(false)} onEdit={vi.fn()}/>:<p>已关闭</p>}
  render(<Harness/>)
  const oldSignal=vi.mocked(loadPhotoPreview).mock.calls[0][1]
  fireEvent.click(screen.getByRole('button',{name:'下一张'}))
  expect(oldSignal.aborted).toBe(true)
  expect(await screen.findByRole('img',{name:'当前照片预览'})).toBeInTheDocument()
  await act(async()=>resolveOld(new Blob(['late'])))
  expect(decodePhoto).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
  expect(await screen.findByText('已关闭')).toBeInTheDocument()
  expect(resource.dispose).toHaveBeenCalledOnce()
})
it('keeps navigation available when a preview is unavailable and supports retry',async()=>{
  vi.mocked(loadPhotoPreview).mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(new Blob(['jpeg']))
  vi.mocked(decodePhoto).mockResolvedValue({image:{} as ImageBitmap,width:517,height:606,dispose:vi.fn()})
  const view=render(<PhotoViewer id={1} items={[photo(1),photo(2)]} onSelect={vi.fn()} onClose={vi.fn()} onEdit={vi.fn()}/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('照片不可用')
  expect(screen.getByRole('button',{name:'下一张'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button',{name:'重试'}))
  await waitFor(()=>expect(screen.getByRole('img',{name:'当前照片预览'})).toBeInTheDocument());view.unmount()
})
it('uses distinct keys for the image and descriptive editor without duplicating the preview',async()=>{
  const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
  vi.mocked(loadPhotoPreview).mockResolvedValue(new Blob(['jpeg']))
  vi.mocked(decodePhoto).mockResolvedValue({image:{} as ImageBitmap,width:517,height:606,dispose:vi.fn()})
  const view=render(<PhotoViewer id={1} items={[photo(1),photo(2)]} onSelect={vi.fn()} onClose={vi.fn()} onEdit={vi.fn()} onMetadata={vi.fn()}/>)
  await screen.findByRole('img',{name:'当前照片预览'})
  expect(screen.getAllByRole('img',{name:'当前照片预览'})).toHaveLength(1)
  expect(screen.getByRole('button',{name:'描述元数据与 XMP'})).toBeInTheDocument()
  expect(errors.mock.calls.flat().join(' ')).not.toContain('same key')
  view.unmount();errors.mockRestore()
})
