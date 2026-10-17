import { create } from 'zustand'

export type ToastType = 'success' | 'warning' | 'error' | 'info'
export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration?: number
  onClose?: () => void
}
interface ToastStore {
  toasts: ToastMessage[]
  addToast: (toast: Omit<ToastMessage, 'id'>) => string
  removeToast: (id: string) => void
}
let nextId = 0
export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++nextId}`
    const duration = toast.duration ?? 3000
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, duration: Number.isFinite(duration) && duration >= 0 ? duration : 3000 }] }))
    return id
  },
  removeToast: (id) => {
    const toast = get().toasts.find((item) => item.id === id)
    if (!toast) return
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
    toast.onClose?.()
  },
}))
