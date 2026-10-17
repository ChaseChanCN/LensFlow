import { Button } from '@/components/ui'
import { DEFAULT_EDITS, EDIT_LIMITS, type EditControl, type ImageEdits } from '@/utils/imageEdit'

export function EditPanel({ edit, onChange, onControlChange, onGestureStart, onGestureEnd }: {
  edit: ImageEdits; onChange: (edit: ImageEdits) => void
  onControlChange?: (edit: ImageEdits, control: EditControl) => void
  onGestureStart?: (control: EditControl) => void; onGestureEnd?: () => void
}) {
  return <section className="photo-editor-controls" aria-label="基础调整">
    <h2>基础调整</h2>
    {(Object.keys(EDIT_LIMITS) as EditControl[]).map(key => {
      const limit = EDIT_LIMITS[key]
      return <div className="photo-editor-control" key={key}>
        <label htmlFor={`edit-${key}`}>{limit.label}</label>
        <output htmlFor={`edit-${key}`}>{edit[key].toFixed(key === 'exposure_ev' ? 1 : 0)} {limit.unit}</output>
        <input id={`edit-${key}`} type="range" min={limit.min} max={limit.max} step={limit.step}
          value={edit[key]} onChange={event => {
            const next = { ...edit, [key]: Number(event.target.value) }
            if (onControlChange) onControlChange(next, key); else onChange(next)
          }}
          onPointerDown={() => onGestureStart?.(key)} onPointerUp={onGestureEnd} onPointerCancel={onGestureEnd}
          onBlur={onGestureEnd} onKeyDown={event => {
            if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) onGestureStart?.(key)
          }} onKeyUp={onGestureEnd} />
      </div>
    })}
    <Button variant="gray" type="button" onClick={() => onChange({ ...DEFAULT_EDITS })}>重置全部调整</Button>
    <p className="photo-editor-note">编辑参数自动保存到草稿，原始照片保持不变。导出采用当前界面参数，与草稿保存独立。</p>
  </section>
}
