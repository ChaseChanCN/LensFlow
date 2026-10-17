import { expect, it } from 'vitest'
import {parseFilters,serializeFilters,libraryPath,lightTablePath,editorPath} from './catalogFilters'
import {timelineParent} from '@/api/metadataIndex'
it('normalizes exact device values, ranges and local dates without changing old URLs',()=>{
 const filters=parseFilters(new URLSearchParams('rating_min=4&camera_model=+EOS++70D+&iso_min=200&focal_max=50.0&aperture_min=2.8&captured_from=2026-01-01&captured_to=2026-12-31'))
 expect(filters.metadata).toEqual({camera_model:'eos 70d',iso_min:200,focal_max:50,aperture_min:2.8,captured_from:'2026-01-01',captured_to:'2026-12-31'})
 expect(parseFilters(new URLSearchParams(serializeFilters(filters)))).toEqual(filters)
 expect(timelineParent(filters)).toEqual({level:'month',year:2026})
 expect(timelineParent({...filters,metadata:{captured_from:'2026-01-01',captured_to:'2026-01-31'}})).toEqual({level:'day',year:2026,month:1})
})
it('rejects invalid and contradictory URL state and preserves unknown dates explicitly',()=>{
 for(const q of ['iso_min=NaN','iso_min=1.0','iso_max=Infinity','focal_min=1e2','focal_min=-1','aperture_max=1025','iso_min=400&iso_max=100','captured_from=2026-02-30','captured_from=2026-01-01&captured_to=2025-01-01','capture_unknown=true&captured_from=2026-01-01','camera_model=x&metadata_status=pending','camera_model=x&camera_model=y','camera_model=','metadata_status=bad'])expect(()=>parseFilters(new URLSearchParams(q))).toThrow()
 expect(serializeFilters(parseFilters(new URLSearchParams('capture_unknown=true')))).toBe('capture_unknown=true')
})
it('preserves all metadata conditions through viewer/compare/editor return context',()=>{
 const query='camera_model=eos+70d&iso_min=200&capture_unknown=true'
 expect(libraryPath(1,query)).toContain(query)
 expect(new URLSearchParams(lightTablePath(1,[1,2],query).split('?')[1]).get('library')).toBe(query)
 expect(new URLSearchParams(editorPath(1,1,query,[1,2]).split('?')[1]).get('library')).toBe(query)
})
