import { expect,it } from 'vitest'
import raw from './__fixtures__/image-geometry-v2.json?raw'
import { geometryPixels,pixelCropBox,transformedSize } from './imageGeometry'
import { editPixels,type ImageEditsV2 } from './imageEdit'
const fixture=JSON.parse(raw) as {cases:{name:string;width:number;height:number;rgb:number[];edit:ImageEditsV2;box:number[];output_width:number;output_height:number;output_rgb:number[]}[]}
it.each(fixture.cases)('matches actual backend vectors: $name',sample=>{
  const source=new Uint8ClampedArray(sample.rgb.flatMap((_,i)=>i%3===0?[...sample.rgb.slice(i,i+3),255]:[]))
  const [w,h]=transformedSize(sample.width,sample.height,sample.edit.geometry.rotation_quadrants)
  expect(pixelCropBox(w,h,sample.edit.geometry.crop)).toEqual(sample.box)
  const geometry=geometryPixels(source,sample.width,sample.height,sample.edit.geometry)
  expect([geometry.width,geometry.height]).toEqual([sample.output_width,sample.output_height])
  const actual=Array.from(editPixels(geometry.data,sample.edit)).filter((_,i)=>i%4!==3)
  const diff=actual.map((value,i)=>Math.abs(value-sample.output_rgb[i]))
  expect(Math.max(...diff)).toBeLessThanOrEqual(1)
  expect(diff.reduce((a,b)=>a+b,0)/diff.length).toBeLessThan(0.05)
})
