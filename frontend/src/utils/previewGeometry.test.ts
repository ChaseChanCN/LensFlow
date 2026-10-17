import { expect,it } from 'vitest'
import { previewCropWindow } from './previewGeometry'
import { identityGeometry } from './imageGeometry'
it('uses one canonical full-size ROI for every preview resolution, without expanding low-res edges',()=>{
  const g={...identityGeometry(),rotation_quadrants:1,crop:{x:0.13,y:0.17,width:0.72,height:0.61}}
  for(const [width,height] of [[606,517],[1024,874],[127,108],[512,437]]){
    const result=previewCropWindow(width,height,517,606,g)
    expect(result.box).toEqual([78,87,516,404])
    expect(result.sx/width).toBeCloseTo(78/606,14)
    expect(result.sy/height).toBeCloseTo(87/517,14)
    expect((result.sx+result.sw)/width).toBeCloseTo(516/606,14)
    expect((result.sy+result.sh)/height).toBeCloseTo(404/517,14)
  }
})
