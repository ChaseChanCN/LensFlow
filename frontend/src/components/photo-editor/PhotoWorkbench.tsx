import { useState } from 'react'
import type { Photo } from '@/api/photos'
import { Button, ErrorState, LoadingState } from '@/components/ui'
import { geometryOf, isZeroEdit } from '@/utils/imageEdit'
import { AdjustmentControls } from './EditorAdjustments'
import { useEditHistory } from './useEditHistory'
import { GeometryPanel, type CropSession } from './GeometryPanel'
import { transformedSize } from '@/utils/imageGeometry'
import type { PhotoResource } from './imageResource'
import type { DraftSession, DraftState } from './DraftSession'
import { ExportPhotoButton } from './ExportPhotoButton'
import { PhotoViewport } from './PhotoViewport'
import { usePhotoResource } from './usePhotoResource'
import { useServerPreview } from './useServerPreview'
import { usePhotoDraft } from './usePhotoDraft'
import { DraftStatus } from './DraftStatus'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'
import './photo-editor.css'

export function PhotoWorkbench({ photo }: { photo: Pick<Photo,'id'> }) {
  const base = usePhotoResource(photo.id)
  const { state: draft, session } = usePhotoDraft(photo.id, base.resource?.sourceSha256)
  const sourceBlocked = draft.status === 'source-conflict'
  if (base.error) return <ErrorState title={base.error} onRetry={base.retry} />
  if (!base.resource) return <LoadingState label="正在读取真实照片预览" />
  if (!base.resource.sourceSha256) return <ErrorState title="无法核对预览的原图指纹，请检查服务端响应头配置" onRetry={base.retry} />
  if (!draft.ready || sourceBlocked) return <><UnsavedChangesGuard dirty={draft.dirty} /><DraftStatus state={draft} session={session} />
    {sourceBlocked ? <Button variant="plain" onClick={base.retry}>重新检查源照片</Button> : draft.status === 'loading' ? <LoadingState label="正在恢复草稿" /> : null}</>
  return <ReadyWorkbench key={draft.historyEpoch} photo={photo} base={base.resource} draft={draft} session={session}/>
}
function ReadyWorkbench({photo,base,draft,session}:{photo:Pick<Photo,'id'>;base:PhotoResource;draft:DraftState;session:DraftSession}) {
  const edit=draft.parameters
  const [crop,setCrop]=useState<CropSession|null>(null)
  const history=useEditHistory(edit,session.update,!crop)
  const server=useServerPreview(photo.id,edit,crop?undefined:base)
  const [width,height]=transformedSize(base.sourceWidth??base.width,base.sourceHeight??base.height,geometryOf(edit).rotation_quadrants)
  return <div className="photo-editor">
    <UnsavedChangesGuard dirty={draft.dirty || !!crop} />
    <div>
      <PhotoViewport base={base} edit={edit} authoritative={server.resource ?? (isZeroEdit(edit) ? base : undefined)} crop={crop} onCropChange={setCrop} onCropCancel={()=>setCrop(null)} />
      <p role="status" aria-live="polite" className="photo-editor-sync">
        {server.status === 'synced' ? '已显示服务端校对结果' : server.status === 'syncing'
          ? '本地预览 · 正在校对…' : server.status === 'error' ? '本地预览 · 服务端校对失败' : '本地预览 · 等待停止调整后校对'}
      </p>
      {server.error && <div role="alert">{server.error} <Button size="sm" variant="plain" onClick={server.retry}>重试校对</Button></div>}
    </div>
    <aside>
      <DraftStatus state={draft} session={session} />
      <GeometryPanel edit={edit} onChange={history.apply} crop={crop} onCrop={setCrop} width={width} height={height}/>
      <fieldset disabled={!!crop}><AdjustmentControls edit={edit} controls={history} /></fieldset>
      {!crop && <ExportPhotoButton photoId={photo.id} edit={edit} />}
    </aside>
  </div>
}
