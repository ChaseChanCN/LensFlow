import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useToastStore, type ToastMessage } from '@/stores/toast'
import { focusActiveModal, getActiveModalPanel, subscribeModalStack } from './modalManager'

export type ToastProps = ToastMessage
const TONES = {
  success: 'border-success-border bg-success-bg text-success-label',
  warning: 'border-warning-border bg-warning-bg text-warning-label',
  error: 'border-error-border bg-error-bg text-error-label',
  info: 'border-info-border bg-info-bg text-info-label',
}
const ICONS = { success: 'M5 12l4 4L19 6', warning: 'M12 8v5m0 3h.01M3 20h18L12 3 3 20Z', error: 'm8 8 8 8m0-8-8 8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', info: 'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0' }

function ToastContent({ type, message, duration: requestedDuration = 3000, onClose }: ToastProps) {
  const [dismissed, setDismissed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const closed = useRef(false)
  const element = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const duration = Number.isFinite(requestedDuration) && requestedDuration >= 0 ? requestedDuration : 3000
  useEffect(() => { close.current = onClose }, [onClose])
  const dismiss = useCallback(() => {
    if (closed.current) return
    closed.current = true
    if (element.current?.contains(document.activeElement)) focusActiveModal()
    setDismissed(true)
    close.current?.()
  }, [])
  useEffect(() => {
    if (dismissed || hovered || focused || duration === 0) return
    const timer = window.setTimeout(dismiss, duration)
    return () => window.clearTimeout(timer)
  }, [dismiss, dismissed, duration, hovered, focused])
  if (dismissed) return null
  return (
    <div ref={element} role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'} aria-atomic="true"
      className={`ds-toast pointer-events-auto flex items-start gap-3 rounded-card border p-4 shadow-elevated ${TONES[type]}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <svg className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[type]} /></svg>
      <p className="min-w-0 flex-1 break-words text-body-sm">{message}</p>
      <button type="button" aria-label="关闭通知" onClick={dismiss} className="shrink-0 rounded-control p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>
  )
}

export function Toast(props: ToastProps) {
  return <ToastContent key={props.id} {...props} />
}

export function ToastViewport({ position = 'top' }: { position?: 'top' | 'bottom' }) {
  const modalPanel = useSyncExternalStore(subscribeModalStack, getActiveModalPanel, () => null)
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)
  if (!toasts.length || typeof document === 'undefined') return null
  return createPortal(
    <div data-toast-viewport={position} className={`pointer-events-none fixed inset-x-4 z-[var(--z-toast)] mx-auto flex max-w-sm flex-col gap-3 ${position === 'top' ? 'top-4' : 'bottom-4'}`}>
      {toasts.map((toast) => <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />)}
    </div>, modalPanel ?? document.body,
  )
}
