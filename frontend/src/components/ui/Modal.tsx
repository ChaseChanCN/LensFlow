import { createContext, useContext, useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { isTopModal, mountModal } from './modalManager'

const ModalDepth = createContext(0)
export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
  ariaLabel?: string
  ariaDescribedBy?: string
  role?: 'dialog' | 'alertdialog'
  initialFocusRef?: RefObject<HTMLElement | null>
}
const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-content-md' }

export function Modal({ isOpen, onClose, title, children, footer, size = 'md', closeOnBackdrop = true, closeOnEsc = true, ariaLabel = '对话框', ariaDescribedBy, role = 'dialog', initialFocusRef }: ModalProps) {
  const depth = useContext(ModalDepth)
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const options = useRef({ onClose, closeOnEsc, initialFocusRef })
  useEffect(() => { options.current = { onClose, closeOnEsc, initialFocusRef } }, [onClose, closeOnEsc, initialFocusRef])
  useEffect(() => {
    if (!isOpen || !root.current || !panel.current) return
    return mountModal({ root: root.current, panel: panel.current, depth, options: () => ({ onClose: options.current.onClose, closeOnEsc: options.current.closeOnEsc, initialFocus: options.current.initialFocusRef?.current }) })
  }, [isOpen, depth])
  if (!isOpen || typeof document === 'undefined') return null
  return createPortal(
    <ModalDepth.Provider value={depth + 1}>
      <div ref={root} data-modal-root="" className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-brand-darkroom-overlay p-4" style={{ zIndex: 'var(--z-modal-backdrop)' }}
        onClick={(event) => { if (event.target === event.currentTarget && closeOnBackdrop && root.current && isTopModal(root.current)) onClose() }}>
        <div ref={panel} role={role} aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : ariaLabel} aria-describedby={ariaDescribedBy} tabIndex={-1}
          className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-sheet bg-surface-primary text-label shadow-[var(--shadow-modal)] focus-visible:outline-2 focus-visible:outline-action-primary-strong ${SIZES[size]}`}>
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-separator-opaque p-4">
            {title ? <h2 id={titleId} className="text-heading-sm font-semibold">{title}</h2> : <span />}
            <button type="button" aria-label="关闭对话框" onClick={onClose} className="rounded-control p-2 text-label-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong">
              <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div className="min-h-0 overflow-y-auto p-4">{children}</div>
          {footer && <footer className="flex shrink-0 justify-end gap-3 border-t border-separator-opaque p-4">{footer}</footer>}
        </div>
      </div>
    </ModalDepth.Provider>, document.body,
  )
}
