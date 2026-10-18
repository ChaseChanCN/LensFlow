import {beforeEach,expect,it,vi} from 'vitest'
import client from './client'
import {effectiveMetadata,inheritedFields,validateFields,keywordInput,loadEffective,writeOverlay,resetOverlay,downloadSidecar,overlayRevisions,batchOverlay,keywordStatus,rebuildKeywords} from './metadataOverlay'
import {defaultFilters,parseFilters,serializeFilters} from '@/utils/catalogFilters'
import {catalogKey} from '@/components/photo-library/usePhotoCatalog'
vi.mock('./client',()=>({default:{get:vi.fn(),put:vi.fn(),delete:vi.fn(),post:vi.fn()}}))
export const overlayDto=(id=1)=>({photo_id:id,revision:0,source_sha256:'a'.repeat(64),source_status:'verified_at_read',source_changed:false,fields:inheritedFields(),original:{title:'原始标题',caption:null,creator:null,copyright:null,keywords:['人像']},effective:{title:'原始标题',caption:null,creator:null,copyright:null,keywords:['人像']},provenance:Object.fromEntries(['title','caption','creator','copyright','keywords'].map(n=>[n,{mode:'inherit',source:'xmp'}])),warnings:[]})
beforeEach(()=>vi.clearAllMocks())
it('validates identities, full modes, bounded values and keywords; strips unknown technical values',()=>{
 const dto=overlayDto();expect(effectiveMetadata({...dto,gps:'SECRET'},1)).not.toHaveProperty('gps')
 for(const change of [{photo_id:2},{revision:-1},{source_sha256:'x'},{source_status:'cached'},{fields:{}},{effective:{...dto.effective,keywords:['x'.repeat(129)]}}])expect(()=>effectiveMetadata({...dto,...change},1)).toThrow()
 for(const state of [{mode:'inherit',value:'x'},{mode:'clear',value:[]},{mode:'override'},{mode:'override',value:''},{mode:'override',value:'x'.repeat(513)}])expect(()=>validateFields({...inheritedFields(),title:state})).toThrow()
 expect(keywordInput(' 人像 \n Cafe\u0301\n')).toEqual(['人像','Café'])
 expect(()=>keywordInput('x'.repeat(129))).toThrow()
})
it('uses authenticated API for read/save/reset and downloads real sidecar blobs',async()=>{
 const signal=new AbortController().signal
 vi.mocked(client.get).mockResolvedValueOnce({data:overlayDto()})
 expect((await loadEffective(1,signal)).revision).toBe(0)
 expect(client.get).toHaveBeenCalledWith('/api/v1/photos/1/metadata-effective',{signal})
 vi.mocked(client.put).mockResolvedValueOnce({data:overlayDto()});await writeOverlay(1,0,inheritedFields(),signal)
 expect(client.put).toHaveBeenCalledWith('/api/v1/photos/1/metadata-overlay',{expected_revision:0,fields:inheritedFields()},{signal})
 vi.mocked(client.delete).mockResolvedValueOnce({data:overlayDto()});await resetOverlay(1,0,signal)
 expect(client.delete).toHaveBeenCalledWith('/api/v1/photos/1/metadata-overlay',{data:{expected_revision:0},signal})
 const blob=new Blob(['<x:xmpmeta/>'],{type:'application/rdf+xml'});vi.mocked(client.get).mockResolvedValueOnce({data:blob})
 expect(await downloadSidecar(1,signal)).toBe(blob)
 expect(client.get).toHaveBeenLastCalledWith('/api/v1/photos/1/metadata-sidecar.xmp',{responseType:'blob',signal})
})
it('rejects wrong batch identities and index states rather than accepting partial DTOs',async()=>{
 vi.mocked(client.post).mockResolvedValueOnce({data:{items:[{photo_id:2,revision:0}]}});await expect(overlayRevisions([1])).rejects.toThrow()
 vi.mocked(client.post).mockResolvedValueOnce({data:{results:[{photo_id:1,status:'conflict',metadata:overlayDto()}]}})
 expect((await batchOverlay([{photo_id:1,revision:0}],{type:'keywords_clear'}))[0].status).toBe('conflict')
 vi.mocked(client.get).mockResolvedValueOnce({data:{total:3,indexed:1,unknown:0,complete:true}});await expect(keywordStatus(1)).rejects.toThrow()
 vi.mocked(client.post).mockResolvedValueOnce({data:{processed:[0],has_more:true,next_after_id:0}});await expect(rebuildKeywords(1,0)).rejects.toThrow()
})
it('binds URL/query keys to keyword identities and preserves legacy filters',()=>{
 const filters={...defaultFilters(),keywords:['人像','A&B']},encoded=serializeFilters(filters)
 expect(parseFilters(new URLSearchParams(encoded))).toEqual({...filters,keywords:['A&B','人像']})
 expect(catalogKey(1,2,filters)).not.toEqual(catalogKey(1,2,defaultFilters()))
 expect(serializeFilters(defaultFilters())).toBe('')
 for(const keywords of ['[]','{}','[1]','[""]',JSON.stringify(Array(11).fill('x'))])expect(()=>parseFilters(new URLSearchParams({keywords}))).toThrow()
})
