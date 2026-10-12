import client from './client'

export interface RetouchTask {
  id: number
  order_id: number
  photo_id: number
  status: string
  due_date: string | null
  created_at: string
}

export interface RetouchVersion {
  id: number
  retouch_task_id: number
  storage_key: string
  version_no: number
  uploaded_at: string
}

export interface RetouchFeedback {
  id: number
  retouch_task_id: number
  version_id: number | null
  content: string
  author_id: number
  created_at: string
}

export async function listRetouchTasks(orderId: number): Promise<RetouchTask[]> {
  const resp = await client.get(`/api/v1/orders/${orderId}/retouch-tasks`)
  return resp.data
}

export async function uploadRetouchVersion(
  taskId: number,
  file: File,
): Promise<RetouchVersion> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await client.post(
    `/api/v1/retouch-tasks/${taskId}/versions`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return resp.data
}

export async function listRetouchVersions(
  taskId: number,
): Promise<RetouchVersion[]> {
  const resp = await client.get(`/api/v1/retouch-tasks/${taskId}/versions`)
  return resp.data
}

export async function createFeedback(
  taskId: number,
  content: string,
): Promise<RetouchFeedback> {
  const resp = await client.post(`/api/v1/retouch-tasks/${taskId}/feedback`, {
    content,
  })
  return resp.data
}

export async function listFeedback(
  taskId: number,
): Promise<RetouchFeedback[]> {
  const resp = await client.get(`/api/v1/retouch-tasks/${taskId}/feedback`)
  return resp.data
}

export async function confirmAllRetouch(orderId: number): Promise<RetouchTask> {
  const resp = await client.post(`/api/v1/orders/${orderId}/confirm-retouch`)
  return resp.data
}
