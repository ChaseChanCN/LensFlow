export interface QuickActionItem { label: string; path: string; icon: 'orders' | 'booking' }
export const quickActions: readonly QuickActionItem[] = [
  { label: '查看订单', path: '/orders', icon: 'orders' },
  { label: '新建预约', path: '/booking', icon: 'booking' },
] as const
