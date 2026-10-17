import { useEffect, useRef, useState } from 'react'
import { useEffectsTheme } from '@/components/effects/EffectsTheme'

/** Keep the completed dark scene isolated from the rebuilt light portrait. */
export function ParticlePortrait() {
  const [loaded, setLoaded] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const theme = useEffectsTheme()
  const source = theme === 'light' ? 'reference4' : 'original'
  const [compact, setCompact] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width:720px)').matches)
  useEffect(() => {
    if (source !== 'reference4') return
    const media = window.matchMedia('(max-width:720px)')
    const update = () => setCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [source])
  const syncTheme = () => {
    const paper = frame.current?.parentElement
    const background = paper ? getComputedStyle(paper).backgroundColor : '#f5f4f0'
    frame.current?.contentWindow?.postMessage({type:'lensflow-portrait-theme',theme,background},location.origin)
  }
  useEffect(() => {
    if (loaded) syncTheme()
  }, [loaded,theme])
  useEffect(() => {
    if (source !== 'reference4' || !loaded || !frame.current) return
    const element = frame.current
    const observer = new IntersectionObserver(([entry]) => {
      element.contentWindow?.postMessage({type:'lensflow-portrait-visibility',visible:entry.isIntersecting},location.origin)
    }, {rootMargin:'80px'})
    observer.observe(element)
    return () => observer.disconnect()
  }, [source,loaded,compact])
  return <div className="material-portrait" aria-hidden="true" data-loaded={loaded} data-particle-source={source}>
    <iframe
      key={source}
      ref={frame}
      src={source === 'reference4' ? `/light-portrait.html?layout=${compact ? 'stacked' : 'side'}` : '/lensflow-v24.html?portrait=hero'}
      title="人物粒子肖像"
      tabIndex={-1}
      onLoad={() => {
        setLoaded(true)
        syncTheme()
      }}
      className="material-portrait-frame"
    />
  </div>
}
