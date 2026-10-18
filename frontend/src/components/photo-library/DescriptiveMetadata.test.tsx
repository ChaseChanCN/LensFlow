import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import {DescriptiveMetadata,MetadataForm} from './DescriptiveMetadata'
import * as api from '@/api/metadataOverlay'
import {saveBlob} from '@/utils/download'
vi.mock('@/api/metadataOverlay',async original=>({...await original<typeof import('@/api/metadataOverlay')>(),loadEffective:vi.fn(),writeOverlay:vi.fn(),resetOverlay:vi.fn(),downloadSidecar:vi.fn()}))
vi.mock('@/utils/download',()=>({saveBlob:vi.fn()}))
const data=(id=1):api.EffectiveMetadata=>({photo_id:id,revision:0,source_sha256:'a'.repeat(64),source_status:'verified_at_read',source_changed:false,fields:api.inheritedFields(),original:{title:'原始标题',caption:null,creator:null,copyright:null,keywords:['人像']},effective:{title:'原始标题',caption:null,creator:null,copyright:null,keywords:['人像']},provenance:Object.fromEntries(api.descriptiveNames.map(n=>[n,{mode:'inherit',source:'xmp'}])) as api.EffectiveMetadata['provenance'],warnings:[]})
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.loadEffective).mockResolvedValue(data())})
function title(value='我的标题'){fireEvent.change(screen.getByLabelText('标题模式'),{target:{value:'override'}});fireEvent.change(screen.getByLabelText('标题'),{target:{value}})}
it('loads lazily, initializes inherited fields, saves real snapshots and resets revision',async()=>{
 const dirty=vi.fn(),saved=vi.fn();render(<DescriptiveMetadata photoId={1} onDirty={dirty} onSaved={saved}/>);expect(api.loadEffective).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'描述元数据与 XMP'}));await screen.findByRole('form',{name:'描述元数据编辑'})
 expect(screen.getByLabelText('标题')).toBeDisabled();title()
 expect(dirty).toHaveBeenLastCalledWith(true)
 const edited={...data(),revision:1,fields:{...data().fields,title:{mode:'override' as const,value:'我的标题'}},effective:{...data().effective,title:'我的标题'}}
 vi.mocked(api.writeOverlay).mockResolvedValue(edited)
 fireEvent.click(screen.getByRole('button',{name:'保存描述元数据'}));await screen.findByText('描述元数据已保存，原图保持不变')
 expect(api.writeOverlay).toHaveBeenCalledWith(1,0,edited.fields,expect.any(AbortSignal));expect(saved).toHaveBeenCalled()
 vi.mocked(api.resetOverlay).mockResolvedValue({...data(),revision:2})
 fireEvent.click(screen.getByRole('button',{name:'恢复全部继承'}));await screen.findByText('已恢复继承原始文件')
 expect(api.resetOverlay).toHaveBeenCalledWith(1,1,expect.any(AbortSignal))
})
it('preserves user text on 409, shows server fields and requires explicit reapply',async()=>{
 render(<MetadataForm photoId={1}/>);await screen.findByLabelText('标题');title('保留的草稿')
 const current={...data(),revision:3,effective:{...data().effective,title:'其他会话标题'}}
 vi.mocked(api.writeOverlay).mockRejectedValueOnce({isAxiosError:true,response:{status:409,data:{current}}})
 fireEvent.click(screen.getByRole('button',{name:'保存描述元数据'}));await screen.findByRole('region',{name:'服务器描述元数据'})
 expect(screen.getByLabelText('标题')).toHaveValue('保留的草稿');expect(screen.getByText('其他会话标题')).toBeInTheDocument()
 vi.mocked(api.writeOverlay).mockResolvedValue({...data(),revision:4})
 fireEvent.click(screen.getByRole('button',{name:'确认以我的完整草稿重新提交'}))
 await waitFor(()=>expect(api.writeOverlay).toHaveBeenLastCalledWith(1,3,expect.objectContaining({title:{mode:'override',value:'保留的草稿'}}),expect.any(AbortSignal)))
})
it('aborts and ignores a stale photo result and releases operations on unmount',async()=>{
 let resolve!:(value:api.EffectiveMetadata)=>void
 vi.mocked(api.loadEffective).mockReturnValueOnce(new Promise(done=>{resolve=done})).mockResolvedValueOnce(data(2))
 const view=render(<MetadataForm key={1} photoId={1}/>),signal=vi.mocked(api.loadEffective).mock.calls[0][1]!
 view.rerender(<MetadataForm key={2} photoId={2}/>);await screen.findByLabelText('标题');expect(signal.aborted).toBe(true)
 await act(async()=>resolve({...data(),effective:{...data().effective,title:'过期结果'}}))
 expect(screen.queryByText('过期结果')).toBeNull();view.unmount();expect(vi.mocked(api.loadEffective).mock.calls[1][1]!.aborted).toBe(true)
})
it('warns before collapsing a dirty form and exports only saved metadata',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
 render(<DescriptiveMetadata photoId={1}/>);fireEvent.click(screen.getByRole('button',{name:'描述元数据与 XMP'}));await screen.findByLabelText('标题');title()
 fireEvent.click(screen.getByRole('button',{name:'描述元数据与 XMP'}));expect(confirm).toHaveBeenCalled();expect(screen.getByLabelText('标题')).toHaveValue('我的标题')
 expect(screen.getByRole('button',{name:'下载 XMP Sidecar'})).toBeDisabled()
 confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'描述元数据与 XMP'}));fireEvent.click(screen.getByRole('button',{name:'描述元数据与 XMP'}));await screen.findByLabelText('标题')
 const blob=new Blob(['xmp']);vi.mocked(api.downloadSidecar).mockResolvedValue(blob);fireEvent.click(screen.getByRole('button',{name:'下载 XMP Sidecar'}))
 await waitFor(()=>expect(saveBlob).toHaveBeenCalledWith(blob,'photo-1.xmp'));confirm.mockRestore()
})
it('edits keywords with newline input and explicit clear/inherit modes',async()=>{
 render(<MetadataForm photoId={1}/>);await screen.findByLabelText('关键词模式')
 fireEvent.change(screen.getByLabelText('关键词模式'),{target:{value:'override'}});fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'人像\n Studio'}})
 vi.mocked(api.writeOverlay).mockResolvedValue(data());fireEvent.click(screen.getByRole('button',{name:'保存描述元数据'}))
 await waitFor(()=>expect(api.writeOverlay).toHaveBeenCalledWith(1,0,expect.objectContaining({keywords:{mode:'override',value:['人像','Studio']}}),expect.any(AbortSignal)))
})
it('restores clean state when modes and text return to the saved snapshot',async()=>{
 const dirty=vi.fn();render(<MetadataForm photoId={1} onDirty={dirty}/>);await screen.findByLabelText('标题模式')
 title();expect(dirty).toHaveBeenLastCalledWith(true)
 fireEvent.change(screen.getByLabelText('标题模式'),{target:{value:'inherit'}})
 expect(dirty).toHaveBeenLastCalledWith(false)
 expect(screen.getByRole('button',{name:'保存描述元数据'})).toBeDisabled()
})
