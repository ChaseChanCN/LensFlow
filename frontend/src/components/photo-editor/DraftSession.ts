import { draftFailure, getPhotoEditDraft, putPhotoEditDraft, type PhotoEditDraft } from '@/api/photoEditDraft'
import { DEFAULT_EDITS, editsKey, validateEdits, type ImageEdits } from '@/utils/imageEdit'

export const AUTOSAVE_MS = 1000
export type DraftStatus = 'loading' | 'load-error' | 'saved' | 'dirty' | 'saving' | 'error' | 'revision-conflict' | 'source-conflict'
export interface DraftState {
  status: DraftStatus; ready: boolean; parameters: ImageEdits; revision: number
  source_sha256: string; updated_at: string | null; dirty: boolean; error?: string; historyEpoch: number
}

/** One photo/session. Writes are serialized; response acknowledgement is not current UI state. */
export class DraftSession {
  private state: DraftState
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private controller = new AbortController()
  private generation = 0
  private active = false
  private inFlight = false
  private paused = false
  private savedKey = editsKey({ ...DEFAULT_EDITS })
  constructor(privatePhotoId: number, privateSourceHash: string | undefined) {
    this.photoId = privatePhotoId; this.sourceHash = privateSourceHash
    this.state = { status: 'loading', ready: false, parameters: { ...DEFAULT_EDITS },
      revision: 0, source_sha256: privateSourceHash ?? '', updated_at: null, dirty: false, historyEpoch: 0 }
  }
  private photoId: number
  private sourceHash?: string
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private patch(values: Partial<DraftState>) {
    this.state = { ...this.state, ...values }; this.listeners.forEach(listener => listener())
  }
  start = () => {
    this.dispose(); this.active = true; this.controller = new AbortController()
    this.inFlight = false; this.paused = false
    if (this.sourceHash) void this.load(false)
  }
  dispose = () => {
    this.active = false; this.generation++; this.controller.abort(); clearTimeout(this.timer)
  }
  private current(generation: number) { return this.active && generation === this.generation }
  private matchesSource(remote: PhotoEditDraft): boolean {
    if (remote.source_sha256 === this.sourceHash) return true
    this.paused = true
    this.patch({ status: 'source-conflict', error: '预览与草稿对应的原图不一致，请重新检查源照片。' })
    return false
  }
  private failed(error: unknown, loading = false) {
    this.paused = true
    const failure = draftFailure(error)
    this.patch({ status: loading && failure.kind === 'error' ? 'load-error' : failure.kind,
      error: failure.message, dirty: this.state.dirty })
  }
  private async load(overwrite: boolean) {
    if (this.inFlight) return
    const generation = this.generation
    this.inFlight = true
    if (overwrite) this.patch({ status: 'saving', error: undefined })
    try {
      const remote = await getPhotoEditDraft(this.photoId, this.controller.signal)
      if (!this.current(generation) || !this.matchesSource(remote)) return
      this.savedKey = editsKey(remote.parameters)
      if (overwrite) {
        this.patch({ revision: remote.revision, updated_at: remote.updated_at })
        this.paused = false
      } else {
        this.paused = false
        this.patch({ status: 'saved', ready: true, parameters: { ...remote.parameters },
          revision: remote.revision, source_sha256: remote.source_sha256, updated_at: remote.updated_at,
          dirty: false, error: undefined, historyEpoch: this.state.historyEpoch + 1 })
      }
    } catch (error) { if (this.current(generation)) this.failed(error, !this.state.ready) }
    finally {
      if (this.current(generation)) {
        this.inFlight = false
        if (overwrite && !this.paused) {
          // GET latest first, then a normal conditional PUT. Another writer can still win.
          this.patch({ dirty: true }); void this.flush(true)
        }
      }
    }
  }
  update = (parameters: ImageEdits) => {
    if (!this.state.ready || this.state.status === 'source-conflict') return
    const next = validateEdits(parameters)
    if (editsKey(next) === editsKey(this.state.parameters)) return
    clearTimeout(this.timer)
    const dirty = this.inFlight || editsKey(next) !== this.savedKey
    this.patch({ parameters: next, dirty,
      status: this.paused ? this.state.status : this.inFlight ? 'saving' : dirty ? 'dirty' : 'saved' })
    if (dirty && !this.inFlight && !this.paused) this.timer = setTimeout(() => { void this.flush() }, AUTOSAVE_MS)
  }
  private async flush(force = false) {
    if (!this.active || !this.state.ready || this.inFlight || this.paused) return
    if (!force && editsKey(this.state.parameters) === this.savedKey) { this.patch({ dirty: false, status: 'saved' }); return }
    clearTimeout(this.timer)
    const generation = this.generation
    const parameters = { ...this.state.parameters }, snapshotKey = editsKey(parameters), revision = this.state.revision
    this.inFlight = true
    this.patch({ status: 'saving', dirty: true, error: undefined })
    try {
      const remote = await putPhotoEditDraft(this.photoId, { parameters, expected_revision: revision,
        expected_source_sha256: this.state.source_sha256 }, this.controller.signal)
      if (!this.current(generation) || !this.matchesSource(remote)) return
      if (remote.revision !== revision + 1 || editsKey(remote.parameters) !== snapshotKey) throw new Error('服务器保存回执不匹配，请重新读取草稿')
      this.savedKey = snapshotKey
      const dirty = editsKey(this.state.parameters) !== snapshotKey
      this.patch({ revision: remote.revision, updated_at: remote.updated_at, dirty,
        status: dirty ? 'dirty' : 'saved' })
    } catch (error) { if (this.current(generation)) this.failed(error) }
    finally {
      if (this.current(generation)) {
        this.inFlight = false
        if (this.state.dirty && !this.paused) void this.flush()
      }
    }
  }
  retry = () => {
    if (this.inFlight || this.state.status === 'source-conflict' || this.state.status === 'revision-conflict') return
    this.paused = false
    if (!this.state.ready) { this.start(); return }
    void this.flush(true)
  }
  reloadRemote = () => {
    if (this.inFlight || this.state.status === 'source-conflict') return
    clearTimeout(this.timer); void this.load(false)
  }
  overwriteRemote = () => {
    if (this.state.status !== 'revision-conflict' || this.inFlight) return
    clearTimeout(this.timer); void this.load(true)
  }
}
