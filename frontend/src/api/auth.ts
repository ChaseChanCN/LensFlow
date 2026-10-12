import client from './client'
import type { User, ApiError } from '@/types'

interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export async function register(data: {
  email: string
  password: string
  name: string
  role: 'photographer' | 'client'
  phone?: string
}): Promise<AuthResponse> {
  const resp = await client.post('/api/v1/auth/register', data)
  return resp.data
}

export async function login(data: {
  email: string
  password: string
}): Promise<AuthResponse> {
  const resp = await client.post('/api/v1/auth/login', data)
  return resp.data
}

export async function logout(): Promise<void> {
  await client.post('/api/v1/auth/logout')
}

export async function getMe(): Promise<User> {
  const resp = await client.get('/api/v1/auth/me')
  return resp.data
}

export function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response: { data?: ApiError } }).response
    if (resp.data?.message) {
      return resp.data.message
    }
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}
