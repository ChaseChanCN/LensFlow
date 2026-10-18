import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import {MetadataBatch} from './MetadataBatch'
import {batchOverlay,overlayRevisions} from '@/api/metadataOverlay'
vi.mock('@/api/metadataOverlay',async original=>({...await original<typeof import('@/api/metadataOverlay')>(),batchOverlay:vi.fn(),overlayRevisions:vi.fn()}))
beforeEach(()=>vi.resetAllMocks())
it('uses bounded batch writes and retries only conflicts with fresh revisions after confirmation',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true),saved=vi.fn()
 vi.mocked(overlayRevisions).mockResolvedValueOnce([{photo_id:1,revision:0},{photo_id:2,revision:1}]).mockResolvedValueOnce([{photo_id:2,revision:2}])
 vi.mocked(batchOverlay).mockResolvedValueOnce([{photoId:1,status:'success'},{photoId:2,status:'conflict'}] as Awaited<ReturnType<typeof batchOverlay>>).mockResolvedValueOnce([{photoId:2,status:'success'}] as Awaited<ReturnType<typeof batchOverlay>>)
 render(<MetadataBatch ids={[1,2]} disabled={false} onSaved={saved}/>);fireEvent.change(screen.getByLabelText('批量描述值'),{target:{value:'人像\nPortfolio'}})
 fireEvent.click(screen.getByRole('button',{name:'应用到已选 2 张'}));await screen.findByText('成功 1 张，需处理 1 张')
 expect(batchOverlay).toHaveBeenCalledWith([{photo_id:1,revision:0},{photo_id:2,revision:1}],{type:'keywords_add',keywords:['人像','Portfolio']},expect.any(AbortSignal))
 fireEvent.click(screen.getByRole('button',{name:'确认后读取最新版本并重试失败项'}));await screen.findByText('成功 1 张，需处理 0 张')
 expect(overlayRevisions).toHaveBeenLastCalledWith([2],expect.any(AbortSignal));expect(saved).toHaveBeenCalledTimes(2);confirm.mockRestore()
})
it('chunks selections and aborts in-flight requests when the library unmounts',async()=>{
 let resolve!:(v:{photo_id:number;revision:number}[])=>void
 vi.mocked(overlayRevisions).mockReturnValueOnce(new Promise(done=>{resolve=done}))
 const view=render(<MetadataBatch ids={Array.from({length:1001},(_,i)=>i+1)} disabled={false} onSaved={vi.fn()}/>)
 fireEvent.change(screen.getByLabelText('批量描述操作'),{target:{value:'keywords_clear'}});fireEvent.click(screen.getByRole('button',{name:'应用到已选 1001 张'}))
 const args=vi.mocked(overlayRevisions).mock.calls[0];expect(args[0]).toHaveLength(10);view.unmount();expect(args[1]!.aborted).toBe(true)
 await act(async()=>resolve([]));await waitFor(()=>expect(overlayRevisions).toHaveBeenCalledTimes(1))
})
