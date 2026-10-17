import { expect,it } from 'vitest'
import { DEFAULT_EDITS,normalizeEdits,validateEdits,editsKey } from './imageEdit'
import { identityGeometry,pixelCropBox,rotateGeometry,flipGeometry,aspectCrop,pointerInImage,geometryPixels } from './imageGeometry'
it('preserves v1 until an actual edit and normalizes all colors to v2',()=>{
  const v1={...DEFAULT_EDITS,exposure_ev:0.7,contrast:25,saturation:-30}
  expect(validateEdits(v1).schema_version).toBe(1)
  expect(normalizeEdits(v1)).toEqual({...v1,schema_version:2,geometry:identityGeometry()})
  expect(editsKey(normalizeEdits(v1))).not.toBe(editsKey({...normalizeEdits(v1),geometry:{...identityGeometry(),rotation_quadrants:1}}))
})
it('strictly validates v2 and deep clones geometry',()=>{
  const edit=normalizeEdits(DEFAULT_EDITS),clone=validateEdits(edit)
  expect(clone).toEqual(edit);expect((clone as typeof edit).geometry).not.toBe(edit.geometry)
  for(const bad of [{rotation_quadrants:true},{flip_horizontal:1},{crop:{x:0,y:0,width:0,height:1}},{crop:{x:0.8,y:0,width:0.3,height:1}},{crop:{x:NaN,y:0,width:1,height:1}},{extra:1}]){
    expect(()=>validateEdits({...edit,geometry:{...edit.geometry,...bad}} as typeof edit)).toThrow()
  }
})
it('uses the specified stable pixel edges including 1px and odd bounds',()=>{
  expect(pixelCropBox(7,5,{x:0.1,y:0.2,width:0.6,height:0.6})).toEqual([0,1,5,4])
  expect(pixelCropBox(1,1,{x:0.999999,y:0.999999,width:0.000001,height:0.000001})).toEqual([0,0,1,1])
  expect(pixelCropBox(10,10,{x:0.3,y:0.3,width:0.6,height:0.6})).toEqual([3,3,9,9])
})
it('preserves crop content through rotation/flip composition',()=>{
  const g={...identityGeometry(),flip_horizontal:true,crop:{x:0.1,y:0.2,width:0.3,height:0.4}}
  const next=rotateGeometry(g,1)
  expect(next.flip_vertical).toBe(true);expect(next.flip_horizontal).toBe(false)
  expect(next.crop?.x).toBeCloseTo(0.4);expect(next.crop?.y).toBeCloseTo(0.1)
  expect(rotateGeometry(g,4)).toEqual(g)
  expect(flipGeometry(g,'horizontal').crop?.x).toBeCloseTo(0.6)
})
it('aspect ratio is based on physical pixels and pointers on CSS image bounds, independent of DPR',()=>{
  const c=aspectCrop({x:0,y:0,width:1,height:1},1.5,606,517)
  expect(c.width*606/(c.height*517)).toBeCloseTo(1.5,12)
  for(const zoom of [0.5,1,4]){
    const rect={left:30,top:80,width:606*zoom,height:517*zoom}
    expect(pointerInImage(30+rect.width*0.3,80+rect.height*0.4,rect)).toEqual({x:0.3,y:0.4})
  }
})
it('transposes asymmetric pixels with exact quadrant and flip semantics',()=>{
  const input=new Uint8ClampedArray([1,2,3,4,5,6].flatMap(n=>[n,n,n,255]))
  const rotated=geometryPixels(input,3,2,{...identityGeometry(),rotation_quadrants:1})
  expect([rotated.width,rotated.height]).toEqual([2,3])
  expect(Array.from(rotated.data).filter((_,i)=>i%4===0)).toEqual([4,1,5,2,6,3])
})
it('rotating or flipping after a crop preserves exactly the same integer pixel content',()=>{
  const source=new Uint8ClampedArray(Array.from({length:7*5},(_,n)=>[n,n,n,255]).flat())
  for(const q of [0,1,2,3])for(const horizontal of [false,true])for(const vertical of [false,true]){
    const g={rotation_quadrants:q,flip_horizontal:horizontal,flip_vertical:vertical,crop:{x:0.1,y:0.2,width:0.5,height:0.6}}
    const previous=geometryPixels(source,7,5,g)
    for(const op of ['rotate','horizontal','vertical'] as const){
      const next=op==='rotate'?rotateGeometry(g,1):flipGeometry(g,op)
      const actual=geometryPixels(source,7,5,next)
      const expected=geometryPixels(previous.data,previous.width,previous.height,{...identityGeometry(),rotation_quadrants:op==='rotate'?1:0,flip_horizontal:op==='horizontal',flip_vertical:op==='vertical'})
      expect(actual).toEqual(expected)
    }
  }
})
