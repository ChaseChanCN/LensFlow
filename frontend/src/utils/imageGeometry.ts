export interface CropRect { x: number; y: number; width: number; height: number }
export interface Geometry { rotation_quadrants: number; flip_horizontal: boolean; flip_vertical: boolean; crop: CropRect | null }
export const identityGeometry = (): Geometry => ({ rotation_quadrants: 0, flip_horizontal: false, flip_vertical: false, crop: null })
export function validateGeometry(value: unknown): Geometry {
  if (!value || typeof value !== 'object') throw new Error('无效几何参数')
  const g = value as Geometry
  if (Object.keys(g).some(k => !['rotation_quadrants','flip_horizontal','flip_vertical','crop'].includes(k))
    || !Number.isInteger(g.rotation_quadrants) || g.rotation_quadrants < 0 || g.rotation_quadrants > 3
    || typeof g.flip_horizontal !== 'boolean' || typeof g.flip_vertical !== 'boolean') throw new Error('无效几何参数')
  let crop: CropRect | null = null
  if (g.crop !== null) {
    const c = g.crop
    if (!c || typeof c !== 'object' || Object.keys(c).some(k => !['x','y','width','height'].includes(k))
      || [c.x,c.y,c.width,c.height].some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)
      || c.width <= 0 || c.height <= 0 || c.x+c.width > 1 || c.y+c.height > 1) throw new Error('裁剪区域超出图片')
    crop = { x:c.x, y:c.y, width:c.width, height:c.height }
  }
  return { rotation_quadrants:g.rotation_quadrants, flip_horizontal:g.flip_horizontal, flip_vertical:g.flip_vertical, crop }
}
export function transformedSize(width: number, height: number, q: number): [number,number] {
  return q % 2 ? [height,width] : [width,height]
}
export function pixelCropBox(width: number, height: number, crop: CropRect | null): [number,number,number,number] {
  if (!crop) return [0,0,width,height]
  const edge = (v: number, n: number, upper: boolean) => {
    let scaled=v*n; const near=Math.round(scaled)
    if (Math.abs(scaled-near)<=1e-9) scaled=near
    return upper ? Math.ceil(scaled) : Math.floor(scaled)
  }
  const l=Math.min(width-1,Math.max(0,edge(crop.x,width,false))), t=Math.min(height-1,Math.max(0,edge(crop.y,height,false)))
  return [l,t,Math.min(width,Math.max(l+1,edge(crop.x+crop.width,width,true))),Math.min(height,Math.max(t+1,edge(crop.y+crop.height,height,true)))]
}
export function boundedRect(c: CropRect): CropRect {
  const width=Math.max(1e-9,Math.min(1,c.width)),height=Math.max(1e-9,Math.min(1,c.height))
  return {x:Math.max(0,Math.min(1-width,c.x)), y:Math.max(0,Math.min(1-height,c.y)),width,height}
}
/** Rotate the currently transformed image, including its existing crop content. */
export function rotateGeometry(g: Geometry, delta: number): Geometry {
  let next=validateGeometry(g)
  for (let i=0;i<((delta%4)+4)%4;i++) {
    const c=next.crop
    next={rotation_quadrants:(next.rotation_quadrants+1)%4,flip_horizontal:next.flip_vertical,flip_vertical:next.flip_horizontal,
      crop:c ? boundedRect({x:1-c.y-c.height,y:c.x,width:c.height,height:c.width}) : null}
  }
  return next
}
export function flipGeometry(g: Geometry, axis: 'horizontal'|'vertical'): Geometry {
  const next=validateGeometry(g),c=next.crop
  if (axis==='horizontal') { next.flip_horizontal=!next.flip_horizontal; if(c) next.crop=boundedRect({...c,x:1-c.x-c.width}) }
  else { next.flip_vertical=!next.flip_vertical; if(c) next.crop=boundedRect({...c,y:1-c.y-c.height}) }
  return next
}
export function pointerInImage(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number}) {
  return {x:Math.max(0,Math.min(1,(clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(clientY-rect.top)/rect.height))}
}
/** Physical pixel aspect ratio, not normalized coordinate ratio. */
export function aspectCrop(c: CropRect, ratio: number|null, width:number,height:number): CropRect {
  if (!ratio) return boundedRect(c)
  const normalized=ratio*height/width
  let w=c.width,h=w/normalized
  if(h>c.height){h=c.height;w=h*normalized}
  return boundedRect({x:c.x+(c.width-w)/2,y:c.y+(c.height-h)/2,width:w,height:h})
}
/** Exact integer transpose on RGBA, no resampling. */
export function geometryPixels(data: Uint8ClampedArray,width:number,height:number,g:Geometry) {
  const [w,h]=transformedSize(width,height,g.rotation_quadrants),[l,t,r,b]=pixelCropBox(w,h,g.crop)
  const output=new Uint8ClampedArray((r-l)*(b-t)*4)
  for(let y=t;y<b;y++) for(let x=l;x<r;x++) {
    const fx=g.flip_horizontal?w-1-x:x,fy=g.flip_vertical?h-1-y:y
    let sx=fx,sy=fy
    if(g.rotation_quadrants===1){sx=fy;sy=height-1-fx}
    if(g.rotation_quadrants===2){sx=width-1-fx;sy=height-1-fy}
    if(g.rotation_quadrants===3){sx=width-1-fy;sy=fx}
    const source=(sy*width+sx)*4,target=((y-t)*(r-l)+x-l)*4
    output.set(data.subarray(source,source+4),target)
  }
  return {data:output,width:r-l,height:b-t}
}
