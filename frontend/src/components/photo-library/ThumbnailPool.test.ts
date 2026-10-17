import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { AxiosError } from 'axios'
import { loadThumbnail } from '@/api/photoCatalog'
import { ThumbnailPool } from './ThumbnailPool'
vi.mock('@/api/photoCatalog',()=>({loadThumbnail:vi.fn()}))
const jpeg=new Blob(['jpeg'],{type:'image/jpeg'})
let pool:ThumbnailPool
const create=vi.fn(()=>`blob:test-${Math.random()}`),revoke=vi.fn()
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke});pool=new ThumbnailPool();vi.mocked(loadThumbnail).mockResolvedValue(jpeg)})
afterEach(()=>{pool.dispose();vi.unstubAllGlobals();vi.useRealTimers()})
it('shares requests, revokes URL on final release, reuses bounded Blob cache on remount',async()=>{
  const first=pool.subscribe(1,256,vi.fn()),second=pool.subscribe(1,256,vi.fn());await tick()
  expect(loadThumbnail).toHaveBeenCalledTimes(1);expect(pool.snapshot(1,256).status).toBe('ready')
  first();expect(revoke).not.toHaveBeenCalled();second();expect(revoke).toHaveBeenCalledOnce()
  const again=pool.subscribe(1,256,vi.fn());await tick();expect(loadThumbnail).toHaveBeenCalledTimes(1)
  expect(create).toHaveBeenCalledTimes(2);again()
})
it('bounds concurrency, aborts unmounted requests and ignores late recycled responses',async()=>{
  const pending:{resolve:(blob:Blob)=>void;signal:AbortSignal}[]=[]
  vi.mocked(loadThumbnail).mockImplementation((_id,_size,signal)=>new Promise(resolve=>pending.push({resolve,signal})))
  const releases=Array.from({length:20},(_,i)=>pool.subscribe(i+1,256,vi.fn()))
  expect(loadThumbnail).toHaveBeenCalledTimes(4)
  releases[0]();expect(pending[0].signal.aborted).toBe(true)
  pending[0].resolve(jpeg);await tick();expect(pool.snapshot(1,256).status).toBe('loading')
  expect(create).not.toHaveBeenCalled();expect(loadThumbnail).toHaveBeenCalledTimes(5)
  releases.forEach(release=>release());pending.forEach(item=>item.resolve(jpeg));await tick()
})
it('shows failures, retries once explicitly and caps automatic busy retries',async()=>{
  vi.mocked(loadThumbnail).mockRejectedValueOnce(new Error('offline'))
  const release=pool.subscribe(1,256,vi.fn());await tick();expect(pool.snapshot(1,256).status).toBe('error')
  pool.retry(1,256);await tick();expect(pool.snapshot(1,256).status).toBe('ready');release()
  const busy=Object.assign(new AxiosError('busy'),{response:{status:429}})
  vi.mocked(loadThumbnail).mockRejectedValue(busy)
  const second=pool.subscribe(2,256,vi.fn());await tick();await vi.advanceTimersByTimeAsync(5000)
  expect(pool.snapshot(2,256).status).toBe('error')
  expect(vi.mocked(loadThumbnail).mock.calls.filter(call=>call[0]===2)).toHaveLength(3);second()
})
it('clears resources on auth/page lifecycle and can reactivate after StrictMode cleanup',async()=>{
  const release=pool.subscribe(1,256,vi.fn());await tick();pool.dispose();release()
  expect(revoke).toHaveBeenCalledOnce()
  pool.activate();const next=pool.subscribe(2,256,vi.fn());await tick();expect(pool.snapshot(2,256).status).toBe('ready');next()
})
it('evicts old unreferenced blobs rather than growing with the whole library',async()=>{
  for(let i=1;i<=110;i++){const release=pool.subscribe(i,128,vi.fn());await tick();release()}
  const before=vi.mocked(loadThumbnail).mock.calls.length
  const release=pool.subscribe(1,128,vi.fn());await tick();expect(loadThumbnail).toHaveBeenCalledTimes(before+1);release()
})
it('never starts image requests for an unauthenticated resource scope',async()=>{
  pool.dispose();pool=new ThumbnailPool(false)
  const release=pool.subscribe(1,256,vi.fn());await tick()
  expect(loadThumbnail).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled()
  expect(pool.snapshot(1,256).status).toBe('error');release()
})
