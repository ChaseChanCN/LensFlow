import {expect,it} from 'vitest'
import {parseFilters,serializeFilters,defaultFilters,libraryPath,lightTablePath,editorPath,compareIds} from './catalogFilters'
import {compareGeometry,panView,fitView} from '@/components/photo-library/lightTableMath'
it('canonicalizes bounded OR lists and preserves AND categories through URL round trips',()=>{
 const f=parseFilters(new URLSearchParams('colors=green,red,green&pick=reject,pick&rating_min=4&sort=rating_desc'))
 expect(f).toEqual({rating:null,ratingMin:4,colors:['green','red'],pick:['pick','reject'],sort:'rating_desc'})
 expect(parseFilters(new URLSearchParams(serializeFilters(f)))).toEqual(f)
 expect(serializeFilters(defaultFilters())).toBe('');expect(serializeFilters(parseFilters(new URLSearchParams('rating_min=0')))).toBe('')
})
it('rejects invalid, conflicting, repeated and unknown query state visibly',()=>{
 for(const text of ['rating=6','rating=1.0','rating=1&rating_min=0','colors=orange','pick=deleted','sort=file','unknown=1','rating=1&rating=2'])expect(()=>parseFilters(new URLSearchParams(text))).toThrow()
})
it('preserves library context across compare/editor return without accepting redirect paths',()=>{
 expect(libraryPath(7,'pick=pick&rating_min=4')).toBe('/orders/7/library?rating_min=4&pick=pick')
 const comparison=lightTablePath(7,[1,2],'sort=rating_desc');expect(comparison).toContain('/orders/7/light-table?a=1&b=2&library=sort%3Drating_desc')
 expect(editorPath(7,1,'rating_min=4',[1,2])).toContain('from=library&library=rating_min%3D4&compare=1%2C2')
 expect(compareIds('1','1')).toBeNull();expect(compareIds('01','1')).toBeNull();expect(compareIds('2','3')).toEqual([2,3])
 expect(()=>libraryPath(7,'redirect=https://example.com')).toThrow()
})
it('fits landscape and portrait without stretching and clamps normalized pan',()=>{
 const landscape=compareGeometry(800,400,600,400,fitView()),portrait=compareGeometry(400,800,600,400,fitView())
 expect(landscape).toMatchObject({width:600,height:300,left:0,top:50});expect(portrait).toMatchObject({width:200,height:400,left:200,top:0})
 const zoom=compareGeometry(800,400,600,400,{zoom:4,cx:.5,cy:.5}),panned=panView(zoom,10000,-10000)
 const clamped=compareGeometry(800,400,600,400,panned);expect(clamped.left).toBe(0);expect(clamped.top+clamped.height).toBe(400)
 const other=compareGeometry(400,800,600,400,clamped.view);expect(other.view.zoom).toBe(4);expect(other.view.cx).toBeGreaterThanOrEqual(600/(2*other.width))
 expect(compareGeometry(800,400,600,400,{zoom:99,cx:-100,cy:100}).view.zoom).toBe(8)
 expect(compareGeometry(800,400,600,400,fitView()).view).toEqual(fitView())
})
