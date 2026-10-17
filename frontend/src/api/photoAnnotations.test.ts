import {beforeEach,expect,it,vi} from 'vitest'
import client from './client'
import {readAnnotation,saveAnnotation,batchAnnotations} from './photoAnnotations'
import {photoAsset} from './photoCatalog'
vi.mock('./client',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}))
const raw={photo_id:1,rating:5,color_label:'green',pick_status:'pick',revision:3}
beforeEach(()=>vi.clearAllMocks())
it('uses authenticated metadata endpoints with strict full and partial snapshots',async()=>{
 vi.mocked(client.get).mockResolvedValue({data:raw});const a=await readAnnotation(1)
 vi.mocked(client.put).mockResolvedValue({data:{...raw,revision:4}});expect((await saveAnnotation(a)).revision).toBe(4)
 expect(client.put).toHaveBeenCalledWith('/api/v1/photos/1/annotation',{rating:5,color_label:'green',pick_status:'pick',expected_revision:3})
 vi.mocked(client.post).mockResolvedValue({data:{results:[{photo_id:1,status:'success',annotation:{...raw,revision:4}}]}})
 await batchAnnotations([{photoId:1,revision:3}],{rating:4})
 expect(client.post).toHaveBeenCalledWith('/api/v1/photos/annotations/batch',{items:[{photo_id:1,expected_revision:3}],changes:{rating:4}})
})
it('adapts real catalog annotation fields and rejects mismatched photo identities',()=>{
 const asset={id:1,order_id:1,filename:'a.jpg',mime:'image/jpeg',size_bytes:1,width:10,height:20,created_at:'2026-10-17T00:00:00Z',annotation:raw}
 expect(photoAsset(asset)).toMatchObject({rating:5,colorLabel:'green',pickStatus:'pick',annotationRevision:3})
 expect(()=>photoAsset({...asset,annotation:{...raw,photo_id:2}})).toThrow()
})
it('rejects incomplete or duplicate result sets instead of silently losing failures',async()=>{
 vi.mocked(client.post).mockResolvedValue({data:{results:[]}})
 await expect(batchAnnotations([{photoId:1,revision:3}],{colorLabel:null})).rejects.toThrow()
 await expect(batchAnnotations([],{rating:1})).rejects.toThrow()
 await expect(batchAnnotations([{photoId:1,revision:0},{photoId:1,revision:0}],{rating:1})).rejects.toThrow()
})
