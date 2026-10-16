import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function LandingPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'navigate' && ['/client', '/login'].includes(event.data?.path)) {
        navigate(event.data.path)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigate])

  return (
    <main className="h-screen w-full">
    <iframe
      src="/lensflow-v24.html"
      className="block h-full w-full border-0"
      title="LensFlow"
    />
    </main>
  )
}
