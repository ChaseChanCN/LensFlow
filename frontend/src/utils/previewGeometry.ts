import { pixelCropBox,transformedSize,type Geometry } from './imageGeometry'
/** Map canonical full-resolution integer edges into a downsampled image without rounding again. */
export function previewCropWindow(sourceWidth:number,sourceHeight:number,fullWidth:number,fullHeight:number,g:Geometry){
  const [width,height]=transformedSize(fullWidth,fullHeight,g.rotation_quadrants)
  const [l,t,r,b]=pixelCropBox(width,height,g.crop)
  const scale=Math.min(sourceWidth/width,sourceHeight/height)
  return {sx:l/width*sourceWidth,sy:t/height*sourceHeight,sw:(r-l)/width*sourceWidth,sh:(b-t)/height*sourceHeight,
    width:Math.max(1,Math.round((r-l)*scale)),height:Math.max(1,Math.round((b-t)*scale)),box:[l,t,r,b]}
}
