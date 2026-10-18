import {AnnotationControls} from './AnnotationControls'
import { MetadataDetails } from './MetadataDetails'
import {DescriptiveMetadata} from './DescriptiveMetadata'
import type {AnnotationChanges} from '@/api/photoAnnotations'
import { useEffect,useRef,useState } from 'react'
import { Modal,Button,LoadingState,ErrorState } from '@/components/ui'
import type { PhotoAsset } from '@/api/photoCatalog'
import { usePhotoResource } from '@/components/photo-editor/usePhotoResource'
function ViewerImage({id}:{id:number}){
  const {resource,error,retry}=usePhotoResource(id),canvas=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const element=canvas.current;if(!resource||!element)return
    element.width=resource.width;element.height=resource.height
    element.getContext('2d')?.drawImage(resource.image,0,0)
  },[resource])
  return error?<ErrorState title={error} onRetry={retry}/>:!resource?<LoadingState label="正在读取照片预览"/>:<div className="asset-viewer-image"><canvas ref={canvas} role="img" aria-label="当前照片预览"/></div>
}
export function PhotoViewer({items,id,onSelect,onClose,onEdit,onMetadata,onDescriptiveSaved,busy=false,notice}:{items:PhotoAsset[];id:number;onSelect:(id:number)=>void;onClose:()=>void;onEdit:(asset:PhotoAsset)=>void;onMetadata?:(ids:number[],changes:AnnotationChanges)=>void;onDescriptiveSaved?:()=>void;busy?:boolean;notice?:string}){
  const [dirty,setDirty]=useState(false)
  const guard=(action:()=>void)=>{if(!dirty||window.confirm('有未保存的描述元数据，放弃修改并继续吗？')){setDirty(false);action()}}
  const index=items.findIndex(asset=>asset.id===id),asset=items[index]
  return <Modal isOpen onClose={()=>guard(onClose)} size="lg" title={asset?.filename??'照片不可用'} footer={asset&&<>
    <Button variant="plain" disabled={index<=0} onClick={()=>guard(()=>onSelect(items[index-1].id))}>上一张</Button>
    <Button variant="plain" disabled={index<0||index>=items.length-1} onClick={()=>guard(()=>onSelect(items[index+1].id))}>下一张</Button>
    <Button variant="gray" onClick={()=>guard(()=>onEdit(asset))}>编辑照片</Button>
  </>}>
    {!asset?<p role="alert">照片已从当前列表移除，请关闭后刷新图库。</p>:<>
      {onMetadata&&<AnnotationControls label={asset.filename} value={asset} disabled={busy||dirty} onChange={changes=>onMetadata([asset.id],changes)}/>}
      {dirty&&<p className="asset-library-note">请先保存或放弃描述草稿再修改评分，避免筛选变化移除当前照片。</p>}
      {notice&&<p role="status">{notice}</p>}
      <ViewerImage key={`preview:${id}`} id={id}/><dl className="asset-viewer-metadata"><dt>尺寸</dt><dd>{asset.width&&asset.height?`${asset.width} × ${asset.height}`:'未知'}</dd><dt>文件大小</dt><dd>{(asset.sizeBytes/1024/1024).toFixed(2)} MiB</dd><dt>上传时间</dt><dd>{new Date(asset.createdAt).toLocaleString()}</dd></dl>
      <MetadataDetails photoId={id}/>
      {onMetadata&&<DescriptiveMetadata key={`description:${id}`} photoId={id} onDirty={setDirty} onSaved={onDescriptiveSaved}/>}
      <p className="asset-library-note">原始照片预览 · 适应视口 · {index+1} / {items.length} 张已加载照片</p>
    </>}
  </Modal>
}
