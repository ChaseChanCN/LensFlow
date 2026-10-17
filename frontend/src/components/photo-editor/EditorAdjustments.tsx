import { Button } from '@/components/ui'
import type { ImageEdits } from '@/utils/imageEdit'
import { EditPanel } from './EditPanel'
import { useEditHistory, type EditHistoryControls } from './useEditHistory'
export function AdjustmentControls({edit,controls}:{edit:ImageEdits;controls:EditHistoryControls}) {
  return <>
    <div className="flex gap-2 mb-3">
      <Button size="sm" variant="gray" disabled={!controls.canUndo} onClick={controls.undo}>撤销</Button>
      <Button size="sm" variant="gray" disabled={!controls.canRedo} onClick={controls.redo}>重做</Button>
    </div>
    <EditPanel edit={edit} onChange={controls.apply} onGestureStart={controls.begin} onGestureEnd={controls.finish} onControlChange={controls.change}/>
  </>
}
export function EditorAdjustments({edit,onChange}:{edit:ImageEdits;onChange:(edit:ImageEdits)=>void}) {
  const controls=useEditHistory(edit,onChange)
  return <AdjustmentControls edit={edit} controls={controls}/>
}
