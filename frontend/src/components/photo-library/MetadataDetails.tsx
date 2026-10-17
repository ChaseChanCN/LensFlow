import { useEffect, useState } from 'react'
import { loadPhotoMetadata, type PhotoMetadataSummary } from '@/api/photoMetadata'
import { imageErrorMessage } from '@/api/imageEdit'
import { Button, ErrorState, LoadingState } from '@/components/ui'
import { useAuthStore } from '@/stores/auth'
import './metadata-details.css'

function MetadataContent({ photoId }: { photoId: number }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ data?: PhotoMetadataSummary; error?: string }>({})
  useEffect(() => {
    const controller = new AbortController()
    loadPhotoMetadata(photoId, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ error: imageErrorMessage(error) })
    })
    return () => controller.abort()
  }, [photoId, attempt])
  if (state.error) return <ErrorState title={state.error} onRetry={() => { setState({}); setAttempt(n => n + 1) }} />
  if (!state.data) return <LoadingState label="正在读取拍摄信息" />
  const data = state.data, missing = '未记录'
  const exposure = data.exposureSeconds === null ? missing : data.exposureSeconds < 1 ? `1/${Math.round(1 / data.exposureSeconds)} 秒` : `${data.exposureSeconds} 秒`
  return <section className="asset-capture-details" aria-label="只读拍摄信息">
    <dl className="asset-viewer-metadata">
      <dt>相机</dt><dd>{data.camera ?? missing}</dd>
      <dt>镜头</dt><dd>{data.lens ?? missing}</dd>
      <dt>拍摄时间</dt><dd>{data.capturedAt ? `${data.capturedAt.replace('T', ' ')}${data.timezoneKnown ? '' : '（时区未知）'}` : missing}</dd>
      <dt>曝光时间</dt><dd>{exposure}</dd>
      <dt>光圈</dt><dd>{data.fNumber === null ? missing : `f/${data.fNumber}`}</dd>
      <dt>ISO</dt><dd>{data.iso ?? missing}</dd>
      <dt>焦距</dt><dd>{data.focalLengthMm === null ? missing : `${data.focalLengthMm} mm`}</dd>
      <dt>原始像素</dt><dd>{data.width} × {data.height}</dd>
      <dt>版权</dt><dd>{data.copyright ?? missing}</dd>
      <dt>说明</dt><dd>{data.caption ?? missing}</dd>
    </dl>
    {data.hasWarnings && <p className="asset-library-note">部分元数据无效、不完整或存在冲突；仅展示可安全读取的信息。</p>}
    <p className="asset-library-note">来自原始文件，信息可被文件作者修改。此处不显示位置与设备序列号。</p>
  </section>
}

function MetadataToggle({ photoId }: { photoId: number }) {
  const [open, setOpen] = useState(false)
  return <div>
    <Button variant="plain" size="sm" aria-expanded={open} onClick={() => setOpen(v => !v)}>拍摄信息</Button>
    {open && <MetadataContent photoId={photoId} />}
  </div>
}

export function MetadataDetails({ photoId }: { photoId: number }) {
  const user = useAuthStore(s => s.user)
  return user?.role === 'photographer' ? <MetadataToggle key={`${user.id}:${photoId}`} photoId={photoId} /> : null
}
