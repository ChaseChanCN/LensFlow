import { useEffect, useState } from 'react'

export function useEffectMotion() {
  const [paused, setPaused] = useState(() => document.hidden || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPaused(document.hidden || query.matches)
    query.addEventListener?.('change', update)
    document.addEventListener('visibilitychange', update)
    return () => { query.removeEventListener?.('change', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  return paused
}
