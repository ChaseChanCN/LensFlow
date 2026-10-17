import {libraryPath,lightTablePath,compareIds} from '@/utils/catalogFilters'
import { loadAsset } from '@/api/photoCatalog'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { listPhotos } from '@/api/photos'
import { imageErrorMessage } from '@/api/imageEdit'
import { Layout } from '@/components/Layout'
import { PhotoWorkbench } from '@/components/photo-editor/PhotoWorkbench'
import { Button, ErrorState, LargeTitle, LoadingState } from '@/components/ui'
import { useAuthStore } from '@/stores/auth'

export function PhotoEditorPage() {
  const [search]=useSearchParams()
  return search.get('from')==='library'?<LibraryEditor/>:<OriginalPhotoEditorPage/>
}
function LibraryEditor(){
  const {id,photoId}=useParams(),navigate=useNavigate(),[search]=useSearchParams(),user=useAuthStore(s=>s.user)
  const orderId=Number(id),selectedId=Number(photoId)
  const valid=Number.isSafeInteger(orderId)&&orderId>0&&Number.isSafeInteger(selectedId)&&selectedId>0
  let returnPath:string,returnError:string|undefined,compareReturn=false
  try{const comparison=search.get('compare')?.split(',')??[];const pair=comparison.length===2?compareIds(comparison[0],comparison[1]):null;if(search.has('compare')&&!pair)throw Error('Invalid comparison context');compareReturn=!!pair;returnPath=pair?lightTablePath(orderId,pair,search.get('library')??''):libraryPath(orderId,search.get('library')??'')}catch{returnPath=`/orders/${orderId}/library`;returnError='返回地址中的筛选或比较条件无效'}
  const allowed=user?.role==='photographer'
  const query=useQuery({queryKey:['photo-asset',user?.id,orderId,selectedId],queryFn:({signal})=>loadAsset(orderId,selectedId,signal),enabled:valid&&allowed,retry:false})
  return <Layout><LargeTitle title="基础修图" subtitle={`订单 #${orderId} · ${query.data?.filename??'JPEG 工作台'}`} action={<Button variant="plain" onClick={()=>navigate(returnPath)}>{compareReturn?'← 返回灯箱':'← 返回图库'}</Button>}/>
    {returnError&&<p role="alert">{returnError}</p>}
    {!allowed?<ErrorState title="仅订单摄影师可使用修图工作台"/>:!valid?<ErrorState title="照片地址无效"/>:query.isPending?<LoadingState label="正在加载照片元数据"/>:query.isError?<ErrorState title={imageErrorMessage(query.error)} onRetry={()=>{void query.refetch()}}/>:query.data?<PhotoWorkbench key={selectedId} photo={{id:query.data.id}}/>:null}
  </Layout>
}
function OriginalPhotoEditorPage() {
  const { id, photoId } = useParams<{ id: string; photoId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const orderId = Number(id), selectedId = Number(photoId)
  const valid = Number.isSafeInteger(orderId) && orderId > 0 && Number.isSafeInteger(selectedId) && selectedId > 0
  const allowed = user?.role === 'photographer'
  const photos = useQuery({ queryKey: ['photos', id], queryFn: () => listPhotos(orderId), enabled: valid && allowed, retry: false })
  const selected = photos.data?.find(photo => photo.id === selectedId && photo.order_id === orderId)
  return <Layout>
    <LargeTitle title="基础修图" subtitle={`订单 #${orderId} · JPEG 工作台`}
      action={<Button variant="plain" onClick={() => navigate(`/orders/${orderId}/upload`)}>← 返回照片</Button>} />
    {!allowed ? <ErrorState title="仅订单摄影师可使用修图工作台" /> : !valid ? <ErrorState title="照片地址无效" />
      : photos.isPending ? <LoadingState label="正在加载订单照片" />
        : photos.isError ? <ErrorState title={imageErrorMessage(photos.error)} onRetry={() => { void photos.refetch() }} />
          : !selected ? <ErrorState title="该订单中没有这张照片" /> : <>
            <div className="photo-editor-picker-row">
              <label htmlFor="editor-photo">当前照片</label>
              <select id="editor-photo" className="photo-editor-picker" value={selectedId}
                onChange={event => navigate(`/orders/${orderId}/photos/${event.target.value}/edit`)}>
                {photos.data?.map(photo => <option key={photo.id} value={photo.id}>{photo.filename}</option>)}
              </select>
              <span className="text-label-muted text-body-sm">草稿自动保存；切换照片后恢复各自参数</span>
            </div>
            <PhotoWorkbench key={`${orderId}:${selectedId}`} photo={selected} />
          </>}
  </Layout>
}
