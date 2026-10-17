import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { Button, Modal } from '@/components/ui'

export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (!dirty) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty])
  useEffect(() => { if (!dirty && blocker.state === 'blocked') blocker.proceed() }, [dirty, blocker])
  return <Modal isOpen={blocker.state === 'blocked'} title="还有未保存的修改" size="sm"
    onClose={() => { if (blocker.state === 'blocked') blocker.reset() }}
    footer={<><Button variant="gray" onClick={() => { if (blocker.state === 'blocked') blocker.reset() }}>留在当前页面</Button>
      <Button variant="plain" onClick={() => { if (blocker.state === 'blocked') blocker.proceed() }}>放弃未保存部分并离开</Button></>}>
    <p>当前修改尚未确认保存。可以留在页面等待保存或处理错误；离开可能丢失未保存部分。已开始的请求可能仍在服务端完成。</p>
  </Modal>
}
