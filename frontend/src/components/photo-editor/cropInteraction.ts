import type { CropRect } from '@/utils/imageGeometry'
import { boundedRect } from '@/utils/imageGeometry'
export function dragCrop(start:CropRect,dx:number,dy:number,handle:string,ratio:number|null,width:number,height:number):CropRect {
  if(handle==='move') return boundedRect({...start,x:start.x+dx,y:start.y+dy})
  const west=handle.includes('w'),east=handle.includes('e'),north=handle.includes('n'),south=handle.includes('s')
  const ax=west?start.x+start.width:east?start.x:start.x+start.width/2
  const ay=north?start.y+start.height:south?start.y:start.y+start.height/2
  let w=Math.max(1/width,start.width+(west?-dx:east?dx:0)),h=Math.max(1/height,start.height+(north?-dy:south?dy:0))
  if(ratio){
    const r=ratio*height/width
    if((west||east)&&(!(north||south)||Math.abs(dx)>=Math.abs(dy)*r)) h=w/r
    else w=h*r
    const minScale=Math.max(1/(width*w),1/(height*h),1);w*=minScale;h*=minScale
  }
  const maxW=west?ax:east?1-ax:2*Math.min(ax,1-ax),maxH=north?ay:south?1-ay:2*Math.min(ay,1-ay)
  if(ratio){const scale=Math.min(1,maxW/w,maxH/h);w*=scale;h*=scale}
  else {w=Math.min(w,maxW);h=Math.min(h,maxH)}
  return boundedRect({x:west?ax-w:east?ax:ax-w/2,y:north?ay-h:south?ay:ay-h/2,width:w,height:h})
}
