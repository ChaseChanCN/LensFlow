import {useState} from 'react'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {indexBatch,loadIndexStatus,loadMetadataFacets,loadTimeline} from '@/api/metadataIndex'
import {defaultFilters,serializeFilters,type CatalogFilters} from '@/utils/catalogFilters'
import {MetadataTools} from './MetadataTools'
vi.mock('@/api/metadataIndex',()=>({indexBatch:vi.fn(),loadIndexStatus:vi.fn(),loadMetadataFacets:vi.fn(),loadTimeline:vi.fn()}))
const counts={total:12,indexed:10,pending:1,failed:1,unsupported:0,unindexed:1,active:0,generation:'1',parser_version:'v1'}
let client:QueryClient
beforeEach(()=>{
 vi.resetAllMocks();client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 vi.mocked(loadIndexStatus).mockResolvedValue(counts)
 vi.mocked(loadMetadataFacets).mockResolvedValue({camera_make:[{value:'canon',count:10}],camera_model:[{value:'eos 70d',count:10}],lens_make:[],lens_model:[{value:'50mm',count:10}],truncated:false,counts})
 vi.mocked(loadTimeline).mockResolvedValue({level:'year',buckets:[{date:'2026',count:9,captured_from:'2026-01-01',captured_to:'2026-12-31'}],unknown:1,matched:10,counts,truncated:false})
})
afterEach(()=>client.clear())
function show(){
 function Harness(){const[value,setValue]=useState<CatalogFilters>(defaultFilters());return <><output aria-label="筛选地址">{serializeFilters(value)}</output><MetadataTools key={serializeFilters(value)} userId={1} orderId={7} value={value} onChange={setValue} disabled={false}/></>}
 return render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>)
}
it('shows incomplete indexing honestly and applies real device/numeric URL conditions',async()=>{
 show();expect(await screen.findByRole('note')).toHaveTextContent('索引尚未完整')
 await screen.findByRole('option',{name:'eos 70d（10）'})
 fireEvent.change(screen.getByRole('combobox',{name:'相机型号'}),{target:{value:'eos 70d'}})
 fireEvent.change(screen.getByRole('spinbutton',{name:'iso min'}),{target:{value:'200'}})
 fireEvent.click(screen.getByRole('button',{name:'应用拍摄条件'}))
 expect(screen.getByLabelText('筛选地址')).toHaveTextContent('camera_model=eos+70d&iso_min=200')
 expect(loadMetadataFacets).toHaveBeenCalledTimes(1)
})
it('clears unapplied input without submitting it as a new filter',async()=>{
 const user=userEvent.setup()
 show();await screen.findByRole('note')
 await user.type(screen.getByRole('spinbutton',{name:'iso min'}),'200')
 await user.click(screen.getByRole('button',{name:'清除拍摄条件'}))
 expect(screen.getByLabelText('筛选地址')).toBeEmptyDOMElement()
 expect(screen.getByRole('spinbutton',{name:'iso min'})).toHaveValue(null)
 await user.click(screen.getByRole('button',{name:'应用拍摄条件'}))
 expect(screen.getByLabelText('筛选地址')).toBeEmptyDOMElement()
})
it('navigates date buckets and explicit unknown without browser timezone conversion',async()=>{
 show();fireEvent.click(await screen.findByRole('button',{name:'2026（9）'}))
 expect(screen.getByLabelText('筛选地址')).toHaveTextContent('captured_from=2026-01-01&captured_to=2026-12-31')
 fireEvent.click(await screen.findByRole('button',{name:'拍摄日期未知（1）'}))
 expect(screen.getByLabelText('筛选地址')).toHaveTextContent('capture_unknown=true')
 fireEvent.click(screen.getByRole('button',{name:'所有年份 / 清除日期'}))
 expect(screen.getByLabelText('筛选地址')).toBeEmptyDOMElement()
})
it('continues bounded batches and exposes explicit retry failures',async()=>{
 vi.mocked(indexBatch).mockResolvedValueOnce({results:[{photo_id:1,status:'indexed',busy:false,reused:false,error_code:null}],next_cursor:'next',counts,continuation:'client_driven'}).mockResolvedValueOnce({results:[{photo_id:2,status:'indexed',busy:false,reused:false,error_code:null}],next_cursor:null,counts:{...counts,indexed:11,pending:0,unindexed:0,generation:'2'},continuation:'client_driven'})
 show();await screen.findByRole('note');fireEvent.click(screen.getByRole('button',{name:'开始 / 继续索引'}))
 await waitFor(()=>expect(indexBatch).toHaveBeenCalledTimes(2))
 expect(vi.mocked(indexBatch).mock.calls[1].slice(0,3)).toEqual([7,'missing','next'])
 await waitFor(()=>expect(screen.getByRole('button',{name:'重试失败项'})).toBeEnabled())
 vi.mocked(indexBatch).mockRejectedValueOnce(new Error('读取失败'))
 fireEvent.click(screen.getByRole('button',{name:'重试失败项'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
})
it('cancels stale filter requests and stops client continuation on unmount',async()=>{
 let done!:(value:Awaited<ReturnType<typeof indexBatch>>)=>void
 vi.mocked(indexBatch).mockReturnValueOnce(new Promise(resolve=>{done=resolve}))
 vi.mocked(loadTimeline).mockReturnValueOnce(new Promise(()=>{}))
 const view=show();await screen.findByRole('note');fireEvent.click(screen.getByRole('button',{name:'开始 / 继续索引'}))
 const signal=vi.mocked(indexBatch).mock.calls[0][3],timelineSignal=vi.mocked(loadTimeline).mock.calls[0][2]
 view.unmount();expect(signal.aborted).toBe(true);expect(timelineSignal.aborted).toBe(true)
 await act(async()=>done({results:[],next_cursor:'next',counts,continuation:'client_driven'}))
 expect(indexBatch).toHaveBeenCalledTimes(1)
})
it('restarts metadata catalog sequences on generation changes without touching thumbnail data',async()=>{
 const reset=vi.spyOn(client,'resetQueries')
 show();await screen.findByRole('note')
 await act(async()=>client.setQueryData(['metadata-status',1,7],{...counts,generation:'2'}))
 await waitFor(()=>expect(reset.mock.calls.some(call=>!!call[0]?.predicate)).toBe(true))
 const predicate=reset.mock.calls.find(call=>!!call[0]?.predicate)?.[0]?.predicate
 expect(predicate?.({queryKey:['photo-catalog',1,7,'camera_model=eos+70d']} as never)).toBe(true)
 expect(predicate?.({queryKey:['photo-catalog',1,7]} as never)).toBe(false)
 expect(predicate?.({queryKey:['thumbnail',1]} as never)).toBe(false)
})
