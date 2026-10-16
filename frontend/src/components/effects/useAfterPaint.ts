import { useEffect, useState } from 'react'

// Keep decorative shader initialization off the first content paint.
// Two animation frames let the plain, usable control paint before lazy imports.
export function useAfterPaint() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(true)) })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [])
  return ready
}
