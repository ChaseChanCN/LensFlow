import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MetadataIssues } from './MetadataIssues'
import { loadMetadataIssues, loadMetadataWarningDetails, retryMetadataIssue, type MetadataIssue } from '@/api/metadataIndex'

vi.mock('@/api/metadataIndex',async importOriginal=>({...await importOriginal<typeof import('@/api/metadataIndex')>(),loadMetadataIssues:vi.fn(),loadMetadataWarningDetails:vi.fn(),retryMetadataIssue:vi.fn()}))
const issue=(id:number,changes:Partial<MetadataIssue>={}):MetadataIssue=>({photo_id:id,filename:`portrait-${id}.jpg`,index_status:'failed',error_code:'NOT_FOUND',warning_count:0,indexed_at:null,retryable:true,current_parser_version:'v1',parser_version:'v1',identity_state:'current_parser',source_verified:false,...changes})
let client:QueryClient
beforeEach(()=>{vi.resetAllMocks();client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});vi.mocked(loadMetadataIssues).mockResolvedValue({items:[],next_cursor:null})})
afterEach(()=>client.clear())
function show(orderId=7){return render(<QueryClientProvider client={client}><MetadataIssues userId={1} orderId={orderId} disabled={false}/></QueryClientProvider>)}
async function open(){fireEvent.click(screen.getByRole('button',{name:'索引诊断 · 展开'}))}

it('is compact by default and loads only after explicit expansion with honest identity copy',async()=>{
 let resolve!:(value:{items:MetadataIssue[];next_cursor:null})=>void
 vi.mocked(loadMetadataIssues).mockReturnValueOnce(new Promise(done=>{resolve=done}))
 show();expect(loadMetadataIssues).not.toHaveBeenCalled();await open()
 expect(screen.getByText('正在读取索引诊断…')).toBeInTheDocument()
 expect(screen.getByText(/列表仅查询已存索引/)).toHaveTextContent('未验证原文件指纹')
 await act(async()=>resolve({items:[],next_cursor:null}))
 expect(await screen.findByText('当前类别暂无诊断项。')).toBeInTheDocument()
 expect(loadMetadataIssues).toHaveBeenCalledWith(7,'failed,unsupported,warnings',null,expect.any(AbortSignal))
 expect(loadMetadataWarningDetails).not.toHaveBeenCalled()
})
it('shows failure, unsupported and warnings without inventing parser warnings or loading originals',async()=>{
 vi.mocked(loadMetadataIssues).mockResolvedValue({items:[issue(1),issue(2,{index_status:'unsupported',error_code:'UNSUPPORTED_FORMAT',retryable:false}),issue(3,{index_status:'indexed',warning_count:3,error_code:'METADATA_WARNINGS',indexed_at:'2026-10-18T00:00:00Z'})],next_cursor:null})
 show();await open()
 const failed=await screen.findByRole('listitem',{name:'照片 1 索引诊断'}),unsupported=screen.getByRole('listitem',{name:'照片 2 索引诊断'}),warnings=screen.getByRole('listitem',{name:'照片 3 索引诊断'})
 expect(failed).toHaveTextContent('原始文件不存在')
 expect(within(unsupported).getByRole('button',{name:'重试此项'})).toBeDisabled()
 expect(warnings).toHaveTextContent('警告 3 项')
 expect(within(warnings).getByRole('button',{name:'读取详细警告'})).toBeEnabled()
 expect(screen.queryByText('xmp.invalid_or_unsafe_packet')).not.toBeInTheDocument()
 expect(loadMetadataWarningDetails).not.toHaveBeenCalled()
})
it('keeps retry failure local while another photo can still succeed and invalidates only metadata scopes',async()=>{
 vi.mocked(loadMetadataIssues).mockResolvedValue({items:[issue(1),issue(2)],next_cursor:null})
 vi.mocked(retryMetadataIssue).mockRejectedValueOnce(new Error('PRIVATE /uploads/secret')).mockResolvedValueOnce({photo_id:2,status:'indexed',reused:false,busy:false,error_code:null})
 const invalidation=vi.spyOn(client,'invalidateQueries')
 show();await open()
 const first=await screen.findByRole('listitem',{name:'照片 1 索引诊断'}),second=screen.getByRole('listitem',{name:'照片 2 索引诊断'})
 fireEvent.click(within(first).getByRole('button',{name:'重试此项'}))
 expect(await within(first).findByRole('alert')).toHaveTextContent('诊断操作未完成')
 expect(document.body.textContent).not.toContain('PRIVATE')
 await waitFor(()=>expect(within(second).getByRole('button',{name:'重试此项'})).toBeEnabled())
 fireEvent.click(within(second).getByRole('button',{name:'重试此项'}))
 await screen.findByText('照片 #2：索引已完成。')
 expect(retryMetadataIssue).toHaveBeenCalledTimes(2)
 expect(invalidation).toHaveBeenCalledWith({queryKey:['metadata-status',1,7]})
 expect(invalidation.mock.calls.some(args=>String(args[0]?.queryKey?.[0]).includes('thumbnail'))).toBe(false)
 expect(screen.getByRole('listitem',{name:'照片 1 索引诊断'})).toHaveTextContent('诊断操作未完成')
})
it('reports server-side pending or failed retry outcomes instead of false success',async()=>{
 vi.mocked(loadMetadataIssues).mockResolvedValue({items:[issue(1)],next_cursor:null})
 vi.mocked(retryMetadataIssue).mockResolvedValueOnce({photo_id:1,status:'pending',reused:false,busy:true,error_code:'METADATA_BUSY'}).mockResolvedValueOnce({photo_id:1,status:'failed',reused:false,busy:false,error_code:'STORAGE_UNAVAILABLE'})
 show();await open();let row=await screen.findByRole('listitem',{name:'照片 1 索引诊断'})
 fireEvent.click(within(row).getByRole('button',{name:'重试此项'}));await screen.findByText('照片 #1：仍在等待处理，可稍后继续。')
 row=screen.getByRole('listitem',{name:'照片 1 索引诊断'});await waitFor(()=>expect(within(row).getByRole('button',{name:'重试此项'})).toBeEnabled())
 fireEvent.click(within(row).getByRole('button',{name:'重试此项'}));expect(await within(row).findByRole('alert')).toHaveTextContent('重试未成功：原始文件暂时无法读取')
})
it('reads actual warning identifiers on one explicit click and handles unknown codes safely',async()=>{
 vi.mocked(loadMetadataIssues).mockResolvedValue({items:[issue(3,{index_status:'indexed',warning_count:4,error_code:'METADATA_WARNINGS'})],next_cursor:null})
 vi.mocked(loadMetadataWarningDetails).mockResolvedValue({photo_id:3,warnings:['xmp.invalid_or_unsafe_packet'],unrecognized_count:1})
 show();await open();fireEvent.click(await screen.findByRole('button',{name:'读取详细警告'}))
 expect(await screen.findByText('xmp.invalid_or_unsafe_packet')).toBeInTheDocument()
 expect(screen.getByText(/另有 1 项未识别警告/)).toBeInTheDocument()
 expect(loadMetadataWarningDetails).toHaveBeenCalledTimes(1)
 expect(loadMetadataWarningDetails).toHaveBeenCalledWith(3,expect.any(AbortSignal))
})
it('shows pending and stale identity states and cancels stale category requests',async()=>{
 vi.mocked(loadMetadataIssues).mockReturnValueOnce(new Promise(()=>{})).mockResolvedValueOnce({items:[issue(4,{index_status:'pending',parser_version:null,identity_state:'unindexed',error_code:null}),issue(5,{index_status:'pending',parser_version:'old',identity_state:'stale_parser',error_code:null,retryable:false})],next_cursor:null})
 show();await open();const oldSignal=vi.mocked(loadMetadataIssues).mock.calls[0][3]
 fireEvent.change(screen.getByRole('combobox',{name:'诊断类别'}),{target:{value:'pending'}})
 expect(await screen.findByText(/尚未建立索引/)).toBeInTheDocument()
 expect(screen.getByText(/旧解析器，需要重建/)).toBeInTheDocument()
 expect(oldSignal.aborted).toBe(true)
 expect(vi.mocked(loadMetadataIssues).mock.calls[1].slice(0,3)).toEqual([7,'pending',null])
})
it('does not allow an old order response to enter the new order and aborts retry on unmount',async()=>{
 let resolve!:(value:{items:MetadataIssue[];next_cursor:null})=>void
 vi.mocked(loadMetadataIssues).mockReturnValueOnce(new Promise(done=>{resolve=done})).mockResolvedValueOnce({items:[issue(8)],next_cursor:null})
 const view=show();await open();const oldSignal=vi.mocked(loadMetadataIssues).mock.calls[0][3]
 view.rerender(<QueryClientProvider client={client}><MetadataIssues userId={1} orderId={8} disabled={false}/></QueryClientProvider>)
 expect(oldSignal.aborted).toBe(true);await open()
 await screen.findByRole('listitem',{name:'照片 8 索引诊断'})
 await act(async()=>resolve({items:[issue(1)],next_cursor:null}))
 expect(screen.queryByRole('listitem',{name:'照片 1 索引诊断'})).not.toBeInTheDocument()
 vi.mocked(retryMetadataIssue).mockReturnValueOnce(new Promise(()=>{}))
 fireEvent.click(screen.getByRole('button',{name:'重试此项'}))
 const retrySignal=vi.mocked(retryMetadataIssue).mock.calls[0][1]
 view.unmount();expect(retrySignal.aborted).toBe(true)
})
it('supports list retry and bounded next-page continuation without losing the first page',async()=>{
 vi.mocked(loadMetadataIssues).mockRejectedValueOnce(new Error('PRIVATE')).mockResolvedValueOnce({items:[issue(1)],next_cursor:'next'}).mockResolvedValueOnce({items:[issue(4)],next_cursor:null})
 show();await open();expect(await screen.findByRole('alert')).toHaveTextContent('无法读取索引诊断')
 fireEvent.click(screen.getByRole('button',{name:'重试诊断列表'}));await screen.findByRole('listitem',{name:'照片 1 索引诊断'})
 fireEvent.click(screen.getByRole('button',{name:'加载更多诊断'}));await screen.findByRole('listitem',{name:'照片 4 索引诊断'})
 expect(screen.getByRole('listitem',{name:'照片 1 索引诊断'})).toBeInTheDocument()
 expect(vi.mocked(loadMetadataIssues).mock.calls[2].slice(0,3)).toEqual([7,'failed,unsupported,warnings','next'])
})
