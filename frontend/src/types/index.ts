export type UserRole = 'photographer' | 'client' | 'admin'

export interface User {
  id: number
  email: string
  name: string
  role: UserRole
  phone?: string
  created_at: string
}

export interface AuthTokens {
  access_token: string
  token_type: string
}

export type OrderStatus =
  | 'PENDING_CONFIRM'
  | 'CONFIRMED'
  | 'WAITING_SHOOT'
  | 'WAITING_UPLOAD'
  | 'ANALYZING'
  | 'WAITING_REVIEW'
  | 'WAITING_SELECTION'
  | 'WAITING_RETOUCH'
  | 'RETOUCHING'
  | 'WAITING_CLIENT_CONFIRM'
  | 'WAITING_DELIVERY'
  | 'DELIVERED'
  | 'ARCHIVED'
  | 'CANCELLED'

export interface Order {
  id: number
  booking_id: number
  client_id: number
  photographer_id: number
  status: OrderStatus
  created_at: string
  updated_at: string
}

export interface ApiError {
  code: string
  message: string
  detail: string
}
