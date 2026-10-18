import client from './client'

export interface Delivery {
  id: number
  order_id: number
  storage_key?: string
  filename: string
  delivered_at: string
}

export async function getDelivery(orderId: number): Promise<Delivery> {
  const resp = await client.get(`/api/v1/orders/${orderId}/delivery`)
  return resp.data
}

export async function uploadDelivery(
  orderId: number,
  file: File,
): Promise<Delivery> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await client.post(`/api/v1/orders/${orderId}/delivery`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return resp.data
}

export async function archiveOrder(orderId: number): Promise<Delivery> {
  const resp = await client.patch(`/api/v1/orders/${orderId}/archive`)
  return resp.data
}

export function getDownloadUrl(deliveryId: number): string {
  const baseURL = import.meta.env.VITE_API_BASE_URL || ''
  return `${baseURL}/api/v1/deliveries/${deliveryId}/download`
}

export async function downloadDelivery(deliveryId: number): Promise<Blob> {
  // Use the authenticated client; a direct link cannot send the Bearer header.
  const response = await client.get(`/api/v1/deliveries/${deliveryId}/download`, { responseType: 'blob' })
  return response.data
}
