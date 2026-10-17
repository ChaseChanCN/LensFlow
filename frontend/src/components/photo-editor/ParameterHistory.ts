import { editsKey, validateEdits, type ImageEdits } from '@/utils/imageEdit'

/** Parameters only. A pointer/keyboard gesture is one committed operation. */
export class ParameterHistory {
  private past: ImageEdits[] = []
  private future: ImageEdits[] = []
  private start?: ImageEdits
  private value: ImageEdits
  constructor(initial: ImageEdits, privateLimit = 50) { this.value = validateEdits(initial); this.limit = privateLimit }
  private limit: number
  get canUndo() { return this.past.length > 0 || (!!this.start && editsKey(this.start) !== editsKey(this.value)) }
  get canRedo() { return this.future.length > 0 }
  begin() { if (!this.start) this.start = validateEdits(this.value) }
  change(next: ImageEdits) {
    const validated = validateEdits(next)
    if (editsKey(validated) === editsKey(this.value)) return
    this.begin(); this.value = validated; this.future = []
  }
  finish() {
    if (this.start && editsKey(this.start) !== editsKey(this.value)) {
      this.past = [...this.past, this.start].slice(-this.limit)
    }
    this.start = undefined
  }
  apply(next: ImageEdits) { this.finish(); this.change(next); this.finish() }
  undo(): ImageEdits | undefined {
    this.finish()
    const previous = this.past.pop()
    if (!previous) return
    this.future.push(validateEdits(this.value)); this.value = previous
    return validateEdits(this.value)
  }
  redo(): ImageEdits | undefined {
    this.finish()
    const next = this.future.pop()
    if (!next) return
    this.past.push(validateEdits(this.value)); this.value = next
    return validateEdits(this.value)
  }
}
