import { useEffect, useRef, useState } from 'react'

interface DarkroomVideoBackgroundProps {
  src: string
  posterSrc?: string
  className?: string
}

export function DarkroomVideoBackground({
  src,
  posterSrc,
  className = '',
}: DarkroomVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [mediaType, setMediaType] = useState<'loading' | 'video' | 'image' | 'error'>('loading')
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) {
      setMediaType('image')
      return
    }

    const video = videoRef.current
    if (!video) return

    const handleLoadedData = () => {
      setMediaType('video')
      video.play().catch((error) => {
        console.warn('视频自动播放失败，降级到图片:', error)
        setMediaType('image')
      })
    }

    const handleError = () => {
      console.warn('视频加载失败，降级到图片:', src)
      setMediaType('image')
    }

    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('error', handleError)

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('error', handleError)
    }
  }, [prefersReducedMotion, src])

  useEffect(() => {
    if (mediaType === 'image') {
      const img = imgRef.current
      if (!img) return

      const handleImageError = () => {
        console.error('图片加载失败，显示降级背景:', src)
        setMediaType('error')
      }

      img.addEventListener('error', handleImageError)
      return () => img.removeEventListener('error', handleImageError)
    }
  }, [mediaType, src])

  if (mediaType === 'error') {
    return (
      <div
        className={`absolute inset-0 bg-[#1a0a0a] ${className}`}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
      </div>
    )
  }

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {(mediaType === 'loading' || mediaType === 'video') && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          poster={posterSrc}
          muted
          loop
          playsInline
          preload="auto"
          style={{
            opacity: mediaType === 'video' ? 1 : 0,
            transition: 'opacity 0.8s ease-in-out',
          }}
        />
      )}

      {mediaType === 'image' && (
        <img
          ref={imgRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          alt="暗房场景背景"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
    </div>
  )
}