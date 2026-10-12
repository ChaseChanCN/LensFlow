import client from './client'
import type { OrderStatus } from '@/types'

export interface Order {
  id: number
  booking_id: number
  client_id: number
  photographer_id: number
  status: OrderStatus
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface OrderTimeline {
  id: number
  order_id: number
  from_status: string | null
  to_status: string
  actor_id: number
  action: string
  note: string | null
  created_at: string
}

export async function listOrders(): Promise<Order[]> {
  const resp = await client.get('/api/v1/orders')
  return resp.data
}

export async function getOrder(id: number): Promise<Order> {
  const resp = await client.get(`/api/v1/orders/${id}`)
  return resp.data
}

export async function updateOrderStatus(
  id: number,
  targetStatus: OrderStatus,
  action: string,
): Promise<Order> {
  const resp = await client.patch(`/api/v1/orders/${id}/status`, {
    target_status: targetStatus,
    action,
  })
  return resp.data
}

export async function getOrderTimeline(id: number): Promise<OrderTimeline[]> {
  const resp = await client.get(`/api/v1/orders/${id}/timeline`)
  return resp.data
}
