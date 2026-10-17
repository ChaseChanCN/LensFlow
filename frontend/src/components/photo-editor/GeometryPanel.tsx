import { Button } from '@/components/ui'
import { geometryOf,normalizeEdits,type ImageEdits } from '@/utils/imageEdit'
import { aspectCrop,flipGeometry,identityGeometry,rotateGeometry,type CropRect } from '@/utils/imageGeometry'
export interface CropSession { rect:CropRect; ratio:number|null }
export function GeometryPanel({edit,onChange,crop,onCrop,width,height}:{edit:ImageEdits;onChange:(edit:ImageEdits)=>void;crop:CropSession|null;onCrop:(crop:CropSession|null)=>void;width:number;height:number}) {
  const g=geometryOf(edit)
  const apply=(geometry:typeof g)=>onChange({...normalizeEdits(edit),geometry})
  return <section className="photo-editor-controls photo-geometry-controls" aria-label="几何调整">
    <h2>几何调整</h2>
    <div className="photo-geometry-buttons">
      <Button size="sm" variant="gray" disabled={!!crop} onClick={()=>apply(rotateGeometry(g,-1))}>左旋 90°</Button>
      <Button size="sm" variant="gray" disabled={!!crop} onClick={()=>apply(rotateGeometry(g,1))}>右旋 90°</Button>
      <Button size="sm" variant="gray" disabled={!!crop} onClick={()=>apply(rotateGeometry(g,2))}>旋转 180°</Button>
      <Button size="sm" variant="gray" disabled={!!crop} onClick={()=>apply(flipGeometry(g,'horizontal'))}>水平翻转</Button>
      <Button size="sm" variant="gray" disabled={!!crop} onClick={()=>apply(flipGeometry(g,'vertical'))}>垂直翻转</Button>
      <Button size="sm" variant="plain" disabled={!!crop} onClick={()=>apply(identityGeometry())}>重置几何</Button>
    </div>
    {!crop ? <>
      <Button size="sm" variant="gray" onClick={()=>onCrop({rect:g.crop?{...g.crop}:{x:0,y:0,width:1,height:1},ratio:null})}>裁剪照片</Button>
      <Button size="sm" variant="plain" disabled={!g.crop} onClick={()=>apply({...g,crop:null})}>重置裁剪</Button>
    </> : <>
      <label htmlFor="crop-ratio">裁剪比例</label>
      <select id="crop-ratio" value={crop.ratio??'free'} onChange={event=>{
        const ratio=event.target.value==='free'?null:Number(event.target.value)
        onCrop({ratio,rect:aspectCrop(crop.rect,ratio,width,height)})
      }}>
        <option value="free">自由比例</option><option value="1">1:1</option><option value={3/2}>3:2</option><option value={4/3}>4:3</option><option value={16/9}>16:9</option>
      </select>
      <p className="photo-editor-note">拖动框内移动；边缘与角点调整大小。Esc 取消；控制点支持方向键。</p>
      <div className="photo-geometry-buttons">
        <Button size="sm" variant="gray" onClick={()=>{apply({...g,crop:crop.rect});onCrop(null)}}>应用裁剪</Button>
        <Button size="sm" variant="plain" onClick={()=>onCrop(null)}>取消裁剪</Button>
      </div>
    </>}
    <p className="photo-editor-note">旋转和翻转在裁剪前执行，已有裁剪随内容一起变换。原图不变。</p>
  </section>
}
