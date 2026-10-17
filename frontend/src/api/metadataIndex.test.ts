import {beforeEach,expect,it,vi} from 'vitest'
import client from './client'
import {indexCounts,indexBatch,loadIndexStatus,loadMetadataFacets,loadTimeline,loadMetadataIssues,metadataIssue,retryMetadataIssue,loadMetadataWarningDetails} from './metadataIndex'
import {defaultFilters} from '@/utils/catalogFilters'
vi.mock('./client',()=>({default:{get:vi.fn(),post:vi.fn()}}))
const counts={total:10,indexed:7,pending:1,failed:1,unsupported:1,unindexed:1,active:0,generation:'1',parser_version:'v1'}
beforeEach(()=>vi.resetAllMocks())
it('uses authenticated bounded APIs and cancellation without per-photo requests',async()=>{
 const signal=new AbortController().signal
 vi.mocked(client.get).mockResolvedValue({data:counts});expect(await loadIndexStatus(1,signal)).toEqual(counts)
 expect(client.get).toHaveBeenCalledWith('/api/v1/orders/1/metadata-index/status',{signal})
 vi.mocked(client.post).mockResolvedValue({data:{results:[],next_cursor:null,counts,continuation:'client_driven'}})
 await indexBatch(1,'retry',null,signal)
 expect(client.post).toHaveBeenCalledWith('/api/v1/orders/1/metadata-index',{mode:'retry',limit:10,cursor:null},{signal,timeout:60000})
})
it('checks counts and bounded facet values instead of inventing devices',async()=>{
 expect(()=>indexCounts({...counts,indexed:20})).toThrow()
 expect(()=>indexCounts({...counts,pending:NaN})).toThrow()
 vi.mocked(client.get).mockResolvedValue({data:{camera_make:[],camera_model:[{value:'canon eos 70d',count:7}],lens_make:[],lens_model:[],truncated:false,counts}})
 expect((await loadMetadataFacets(1,new AbortController().signal)).camera_model[0].value).toBe('canon eos 70d')
})
it('queries timeline by capture-local parent while retaining device and manual filters',async()=>{
 vi.mocked(client.get).mockResolvedValue({data:{level:'month',buckets:[],unknown:1,matched:7,counts,truncated:false}})
 const signal=new AbortController().signal
 await loadTimeline(1,{...defaultFilters(),ratingMin:4,metadata:{camera_model:'canon',captured_from:'2026-01-01',captured_to:'2026-12-31'}},signal)
 expect(client.get).toHaveBeenCalledWith('/api/v1/orders/1/photos/timeline',{params:{rating_min:'4',camera_model:'canon',level:'month',year:2026},signal})
})
const issue={photo_id:4,filename:'portrait.jpg',index_status:'failed',error_code:'NOT_FOUND',warning_count:0,indexed_at:null,retryable:true,current_parser_version:'v1',parser_version:'v1',identity_state:'current_parser',source_verified:false}
it('loads bounded authenticated diagnostics and drops private fields at the adapter boundary',async()=>{
 const signal=new AbortController().signal
 vi.mocked(client.get).mockResolvedValue({data:{items:[{...issue,gps:{latitude:33},storage_key:'private/photo.jpg',serial_number:'SERIAL',raw_xmp:'SECRET'}],next_cursor:'next',access_token:'TOKEN'}})
 const result=await loadMetadataIssues(2,'warnings,failed,unsupported',null,signal)
 expect(client.get).toHaveBeenCalledWith('/api/v1/orders/2/metadata-index/issues',{params:{status:'failed,unsupported,warnings',limit:20},signal})
 expect(result).toEqual({items:[issue],next_cursor:'next'})
 expect(JSON.stringify(result)).not.toMatch(/SERIAL|SECRET|TOKEN|latitude|storage_key/)
})
it('validates issue identity, order-independent paging bounds and normalizes unknown error text',async()=>{
 expect(metadataIssue({...issue,error_code:'private stack trace /root/uploads'}).error_code).toBe('UNKNOWN')
 expect(metadataIssue({...issue,parser_version:null,identity_state:'unindexed',index_status:'pending'}).identity_state).toBe('unindexed')
 expect(metadataIssue({...issue,parser_version:'old',identity_state:'stale_parser',index_status:'pending'}).identity_state).toBe('stale_parser')
 for(const invalid of [{source_verified:true},{warning_count:-1},{photo_id:NaN},{indexed_at:'2026-01-01T00:00:00'},{identity_state:'stale_parser'},{parser_version:null}])expect(()=>metadataIssue({...issue,...invalid})).toThrow()
 vi.mocked(client.get).mockResolvedValueOnce({data:{items:[issue,issue],next_cursor:null}})
 await expect(loadMetadataIssues(2,'failed',null,new AbortController().signal)).rejects.toThrow()
 vi.mocked(client.get).mockResolvedValueOnce({data:{items:[issue],next_cursor:'x'.repeat(513)}})
 await expect(loadMetadataIssues(2,'failed',null,new AbortController().signal)).rejects.toThrow()
 await expect(loadMetadataIssues(2,'failed,failed',null,new AbortController().signal)).rejects.toThrow()
})
it('retries an explicit photo and returns only allowlisted status fields',async()=>{
 const signal=new AbortController().signal,result={photo_id:4,status:'indexed',busy:false,reused:true,error_code:null}
 vi.mocked(client.post).mockResolvedValueOnce({data:{...result,storage_key:'private',camera:{serial_number:'private'}}})
 expect(await retryMetadataIssue(4,signal)).toEqual(result)
 expect(client.post).toHaveBeenCalledWith('/api/v1/photos/4/metadata-index',{},{signal,timeout:60000})
 vi.mocked(client.post).mockResolvedValueOnce({data:{...result,photo_id:5}})
 await expect(retryMetadataIssue(4,signal)).rejects.toThrow('不匹配')
})
it('validates every batch outcome and does not retain extra response fields',async()=>{
 const result={photo_id:4,status:'indexed',busy:false,reused:false,error_code:null},signal=new AbortController().signal
 vi.mocked(client.post).mockResolvedValueOnce({data:{results:[{...result,gps:'PRIVATE'}],next_cursor:null,counts,continuation:'client_driven',secret:'PRIVATE'}})
 expect(await indexBatch(1,'refresh',null,signal)).toEqual({results:[result],next_cursor:null,counts,continuation:'client_driven'})
 vi.mocked(client.post).mockResolvedValueOnce({data:{results:[null],next_cursor:null,counts,continuation:'client_driven'}})
 await expect(indexBatch(1,'refresh',null,signal)).rejects.toThrow()
})
it('reads genuine C1 warning identifiers only on explicit request without retaining private metadata',async()=>{
 const data={metadata_version:1,photo_id:4,source_sha256:'a'.repeat(64),camera:{make:null,model:null,lens_model:null,serial_number:'PRIVATE'},capture:{date_time_original:null,timezone_known:false,exposure_seconds:null,f_number:null,iso:null,focal_length_mm:null},image:{width:517,height:606},description:{copyright:null,caption:null},gps:{latitude:33},warnings:['xmp.invalid_or_unsafe_packet','capture.date_ambiguity','PRIVATE.path-or-serial']}
 vi.mocked(client.get).mockResolvedValue({data})
 const signal=new AbortController().signal,result=await loadMetadataWarningDetails(4,signal)
 expect(client.get).toHaveBeenCalledWith('/api/v1/photos/4/metadata',{signal})
 expect(result).toEqual({photo_id:4,warnings:['xmp.invalid_or_unsafe_packet','capture.date_ambiguity'],unrecognized_count:1})
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE|latitude|source_sha256/)
})
