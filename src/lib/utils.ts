import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  const safe = Number.isFinite(num) ? num : 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe)
}

export function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseInt(num) : num
  const safe = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('en-IN').format(safe)
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  })
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function generateRequestNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `REQ-${year}-${random}`
}

export function generateAllocationNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `ALC-${year}-${random}`
}

export function generateBatchNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `DIST-${year}-${random}`
}

export function generateIssuanceNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
  return `ISS-${year}-${random}`
}

export function generateHandoverNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `HND-${year}-${random}`
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'status-draft',
    SUBMITTED: 'status-submitted',
    UNDER_REVIEW: 'status-under-review',
    APPROVED: 'status-approved',
    PARTIALLY_APPROVED: 'status-partially-approved',
    REJECTED: 'status-rejected',
    WAITLISTED: 'status-waitlisted',
    CANCELLED: 'status-cancelled',
    CLOSED: 'status-closed',
    PENDING: 'status-pending',
    PARTIAL_ALLOCATED: 'status-partial-allocated',
    FULLY_ALLOCATED: 'status-fully-allocated',
    PARTIAL_ISSUED: 'status-partial-issued',
    FULLY_ISSUED: 'status-fully-issued',
    PARTIAL_DELIVERED: 'status-partial-delivered',
    FULLY_DELIVERED: 'status-fully-delivered',
    PREPARING: 'status-pending',
    READY: 'status-submitted',
    IN_PROGRESS: 'status-under-review',
    COMPLETED: 'status-approved',
    PARTIAL: 'status-partially-approved',
  }
  return colors[status] || 'status-draft'
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    LOW: 'priority-low',
    NORMAL: 'priority-normal',
    HIGH: 'priority-high',
    URGENT: 'priority-urgent',
    PROTOCOL: 'priority-protocol',
  }
  return colors[priority] || 'priority-normal'
}

export function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  return cleaned.length === 10 || (cleaned.length === 12 && cleaned.startsWith('91'))
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`
  }
  return phone
}