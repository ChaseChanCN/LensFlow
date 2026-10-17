import { useEffect, useRef } from 'react'
import './card-cursor-glow.css'

const CARDS = '.material-stat-card, .effects-shortcuts, .material-login-panel, .material-analysis-photo, .material-analysis-summary-body, .material-study, .material-album, .rounded-card, [data-cursor-card]'

export function useCardCursorGlow<T extends HTMLElement>(includePortals = false) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let current: HTMLElement | null = null
    let frame = 0
    let x = 0, y = 0
    const touched = new Set<HTMLElement>()
    const fading = new Map<HTMLElement, number>()
    const reset = (card: HTMLElement) => {
      delete card.dataset.cursorGlow
      card.style.removeProperty('--cursor-glow-x')
      card.style.removeProperty('--cursor-glow-y')
      touched.delete(card)
      fading.delete(card)
    }
    const clear = () => {
      if (current) {
        const card = current
        card.dataset.cursorGlow = 'idle'
        const previous = fading.get(card)
        if (previous !== undefined) clearTimeout(previous)
        fading.set(card, window.setTimeout(() => reset(card), 180))
      }
      current = null
      cancelAnimationFrame(frame)
      frame = 0
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(CARDS) : null
      if (!card || (!root.contains(card) && !(includePortals && card.closest('.material-portal')))) { clear(); return }
      if (current !== card) {
        clear()
        const timeout = fading.get(card)
        if (timeout !== undefined) { clearTimeout(timeout); fading.delete(card) }
        current = card
        touched.add(card)
      }
      const rect = card.getBoundingClientRect()
      x = event.clientX - rect.left - card.clientLeft
      y = event.clientY - rect.top - card.clientTop
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        if (!current) return
        current.style.setProperty('--cursor-glow-x', `${x}px`)
        current.style.setProperty('--cursor-glow-y', `${y}px`)
        current.dataset.cursorGlow = 'active'
      })
    }
    if (includePortals) {
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerleave', clear)
    } else {
      root.addEventListener('pointermove', move)
      root.addEventListener('pointerleave', clear)
    }
    window.addEventListener('blur', clear)
    return () => {
      clear()
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerleave', clear)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', clear)
      window.removeEventListener('blur', clear)
      fading.forEach(timeout => clearTimeout(timeout))
      touched.forEach(reset)
    }
  }, [includePortals])
  return ref
}
