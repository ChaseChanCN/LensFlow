import { geometryPixels,type Geometry } from '@/utils/imageGeometry'
import { previewCropWindow } from '@/utils/previewGeometry'
/** All display sampling uses the same full-resolution ROI as export, including fractional preview edges. */
export function canvasGeometry(pixels:ImageData,g:Geometry,fullWidth:number,fullHeight:number){
  const transformed=geometryPixels(pixels.data,pixels.width,pixels.height,{...g,crop:null})
  if(!g.crop)return transformed
  const crop=previewCropWindow(transformed.width,transformed.height,fullWidth,fullHeight,g)
  const input=document.createElement('canvas'),output=document.createElement('canvas')
  try{
    input.width=transformed.width;input.height=transformed.height;output.width=crop.width;output.height=crop.height
    const source=input.getContext('2d'),target=output.getContext('2d',{willReadFrequently:true})
    if(!source||!target)throw new Error('当前浏览器无法使用 Canvas 2D')
    source.putImageData(new ImageData(transformed.data,transformed.width,transformed.height),0,0)
    target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high'
    target.drawImage(input,crop.sx,crop.sy,crop.sw,crop.sh,0,0,crop.width,crop.height)
    return target.getImageData(0,0,crop.width,crop.height)
  }finally{input.width=input.height=output.width=output.height=0}
}
