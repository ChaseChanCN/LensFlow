import client from './client'

export interface SelectionItem {
  id: number
  selection_set_id: number
  photo_id: number
}

export interface SelectionSet {
  id: number
  order_id: number
  max_select: number
  expires_at: string | null
  published_at: string | null
  created_at: string
  items: SelectionItem[]
}

export interface SelectionSubmission {
  id: number
  selection_set_id: number
  selected_photo_ids: string
  submitted_at: string
}

export async function createSelectionSet(
  orderId: number,
  photoIds: number[],
  maxSelect: number,
): Promise<SelectionSet> {
  const resp = await client.post(`/api/v1/orders/${orderId}/selection-set`, {
    photo_ids: photoIds,
    max_select: maxSelect,
  })
  return resp.data
}

export async function getSelectionSet(selectionSetId: number): Promise<SelectionSet> {
  const resp = await client.get(`/api/v1/selection-sets/${selectionSetId}`)
  return resp.data
}

export async function getOrderSelectionSet(orderId: number): Promise<SelectionSet> {
  const resp = await client.get(`/api/v1/orders/${orderId}/selection-set`)
  return resp.data
}

export async function submitSelection(
  selectionSetId: number,
  selectedPhotoIds: number[],
): Promise<SelectionSubmission> {
  const resp = await client.post(
    `/api/v1/selection-sets/${selectionSetId}/submit`,
    { selected_photo_ids: selectedPhotoIds },
  )
  return resp.data
}

export async function getSubmission(
  selectionSetId: number,
): Promise<SelectionSubmission> {
  const resp = await client.get(
    `/api/v1/selection-sets/${selectionSetId}/submission`,
  )
  return resp.data
}
