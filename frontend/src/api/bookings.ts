import client from './client'

export interface Booking {
  id: number
  client_id: number
  photographer_id: number | null
  shoot_type: string
  preferred_date: string | null
  contact_info: string
  note: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function createBooking(data: {
  shoot_type: string
  contact_info: string
  preferred_date?: string
  note?: string
  photographer_id?: number
}): Promise<Booking> {
  const resp = await client.post('/api/v1/bookings', data)
  return resp.data
}

export async function listBookings(): Promise<Booking[]> {
  const resp = await client.get('/api/v1/bookings')
  return resp.data
}

export async function confirmBooking(id: number, photographerId: number): Promise<Booking> {
  const resp = await client.patch(`/api/v1/bookings/${id}/confirm`, {
    photographer_id: photographerId,
  })
  return resp.data
}

export async function cancelBooking(id: number): Promise<Booking> {
  const resp = await client.patch(`/api/v1/bookings/${id}/cancel`)
  return resp.data
}
