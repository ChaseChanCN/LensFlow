import { useEffect, useReducer, useRef, useState } from 'react'
import { normalizeEdits, type EditControl, type ImageEdits } from '@/utils/imageEdit'
import { ParameterHistory } from './ParameterHistory'
export function useEditHistory(edit: ImageEdits,onChange:(edit:ImageEdits)=>void, enabled=true) {
  const [history] = useState(() => new ParameterHistory(edit))
  const [, render] = useReducer(value => value + 1, 0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const gesture = useRef<EditControl | undefined>(undefined)
  const implicitControl = useRef<EditControl | undefined>(undefined)
  const finish = () => { clearTimeout(timer.current); history.finish(); gesture.current = undefined; implicitControl.current = undefined; render() }
  const begin = (control: EditControl) => {
    if (gesture.current !== control) { finish(); gesture.current = control; history.begin() }
  }
  const undo = () => { clearTimeout(timer.current); gesture.current = undefined; const next = history.undo(); if (next) onChange(next); render() }
  const redo = () => { clearTimeout(timer.current); gesture.current = undefined; const next = history.redo(); if (next) onChange(next); render() }
  useEffect(() => {
    if (!enabled) return
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return
      const target = event.target
      if (target instanceof Element && target.closest('textarea, select, input:not([type="range"]), [contenteditable]:not([contenteditable="false"])')) return
      const key = event.key.toLowerCase()
      const backward = key === 'z' && !event.shiftKey
      const forward = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)
      if ((backward && history.canUndo) || (forward && history.canRedo)) {
        event.preventDefault(); clearTimeout(timer.current); gesture.current = undefined
        const next = backward ? history.undo() : history.redo()
        if (next) onChange(next)
        render()
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener('keydown', keyboard); clearTimeout(timer.current) }
  }, [history, onChange, enabled])
  const apply = (next:ImageEdits) => { finish(); const valid=normalizeEdits(next); history.apply(valid); onChange(valid); render() }
  const change = (next:ImageEdits,control:EditControl) => {
    if ((gesture.current && gesture.current !== control) || (implicitControl.current && implicitControl.current !== control)) finish()
    implicitControl.current=control
    const valid=normalizeEdits(next); history.change(valid);onChange(valid);render()
    if (!gesture.current) {clearTimeout(timer.current);timer.current=setTimeout(finish,400)}
  }
  return {canUndo:history.canUndo,canRedo:history.canRedo,undo,redo,finish,begin,apply,change}
}
export type EditHistoryControls=ReturnType<typeof useEditHistory>
