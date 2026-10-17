import { expect, it, vi } from 'vitest'
import client from './client'
import { downloadDelivery } from './deliveries'
vi.mock('./client',()=>({default:{get:vi.fn()}}))
it('downloads through the authenticated API client in Blob mode',async()=>{
  const blob=new Blob(['delivery']);vi.mocked(client.get).mockResolvedValue({data:blob})
  expect(await downloadDelivery(9)).toBe(blob)
  expect(client.get).toHaveBeenCalledExactlyOnceWith('/api/v1/deliveries/9/download',{responseType:'blob'})
})
