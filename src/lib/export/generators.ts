import { detailViews, readReportDetail } from '../report-detail'
import ExcelJS from 'exceljs'
import type { Prisma } from '@prisma/client'

export const EXPORT_TYPES = ['REQUESTS', 'ALLOCATIONS', 'INVENTORY', 'QUOTAS', 'DISTRIBUTION', 'AUDIT', 'REPORTS'] as const
export type ExportType = typeof EXPORT_TYPES[number]
export type ExportFormat = 'CSV' | 'XLSX'
export type ExportCell = string | number | boolean | Date | null | undefined
export type ExportFilters = Record<string, unknown>
export interface Dataset { headers: string[]; rows: ExportCell[][]; summary?: Record<string, string | number> }
type Transaction = Prisma.TransactionClient
const MAX_EXPORT_ROWS = 5000

export const exportPermissions: Record<ExportType, string> = {
  REQUESTS: 'requests:export', AUDIT: 'audit:export', REPORTS: 'reports:export', ALLOCATIONS: 'allocations:read',
  INVENTORY: 'inventory:read', QUOTAS: 'quotas:read', DISTRIBUTION: 'distribution:read',
}

export function csvCell(value: ExportCell): string {
  const text = value instanceof Date ? value.toISOString() : value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function datasetToCsv(dataset: Dataset): string {
  const summary = dataset.summary ? [['Metric', 'Value'], ...Object.entries(dataset.summary), []] : []
  return `﻿${[...summary, dataset.headers, ...dataset.rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export async function datasetToXlsx(dataset: Dataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ACA TicketOps'
  const sheet = workbook.addWorksheet('Export')
  if (dataset.summary) Object.entries(dataset.summary).forEach(([key, value]) => sheet.addRow([key, value]))
  if (dataset.summary) sheet.addRow([])
  sheet.addRow(dataset.headers).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(sheet.rowCount).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } }
  dataset.rows.forEach((row) => sheet.addRow(row))
  sheet.columns.forEach((column, index) => { column.width = Math.min(40, Math.max(14, (dataset.headers[index]?.length ?? 10) + 4)) })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function textFilter(filters: ExportFilters, key: string): string | undefined {
  const value = filters[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function requests(tx: Transaction, matchId?: string, filters: ExportFilters = {}): Promise<Dataset> {
  const search = textFilter(filters, 'search')
  const rows = await tx.request.findMany({
    where: { matchId, status: textFilter(filters, 'status'), requesterId: textFilter(filters, 'requesterId'), ...(search ? { OR: [
      { requestNumber: { contains: search, mode: 'insensitive' } }, { requester: { fullName: { contains: search, mode: 'insensitive' } } },
    ] } : {}) },
    include: { match: { select: { title: true } }, requester: true, items: { include: { ticketCategory: { select: { displayName: true } } } } },
    orderBy: { createdAt: 'desc' }, take: MAX_EXPORT_ROWS,
  })
  return { headers: ['Request Number', 'Match', 'Requester', 'Mobile', 'Email', 'Status', 'Priority', 'Total Requested', 'Total Approved', 'Total Allocated', 'Total Issued', 'Categories', 'Created At'], rows: rows.map((row) => [
    row.requestNumber, row.match.title, row.requester.fullName, row.requester.mobileNumber, row.requester.email, row.status, row.priority,
    row.totalRequested, row.totalApproved, row.totalAllocated, row.totalIssued, row.items.map((item) => `${item.ticketCategory.displayName}: ${item.requestedQuantity}`).join('; '), row.createdAt,
  ]) }
}

async function allocations(tx: Transaction, matchId?: string, filters: ExportFilters = {}): Promise<Dataset> {
  const rows = await tx.allocation.findMany({
    where: { matchId, status: textFilter(filters, 'status'), requestId: textFilter(filters, 'requestId') },
    include: { match: { select: { title: true } }, request: { include: { requester: { select: { fullName: true } } } }, officer: { select: { fullName: true } }, items: { include: { ticketCategory: { select: { displayName: true } } } } },
    orderBy: { createdAt: 'desc' }, take: MAX_EXPORT_ROWS,
  })
  return { headers: ['Allocation Number', 'Match', 'Request Number', 'Requester', 'Officer', 'Status', 'Total Quantity', 'Categories', 'Created At'], rows: rows.map((row) => [
    row.allocationNumber, row.match.title, row.request.requestNumber, row.request.requester.fullName, row.officer.fullName, row.status,
    row.totalQuantity, row.items.map((item) => `${item.ticketCategory.displayName}: ${item.quantity}`).join('; '), row.createdAt,
  ]) }
}

async function inventory(tx: Transaction, matchId?: string, filters: ExportFilters = {}): Promise<Dataset> {
  const rows = await tx.inventoryPool.findMany({
    where: { matchId, ticketCategoryId: textFilter(filters, 'categoryId') },
    include: { match: { select: { title: true } }, ticketCategory: { select: { displayName: true } }, quotaPool: { select: { displayName: true } } },
    orderBy: [{ matchId: 'asc' }, { standName: 'asc' }], take: MAX_EXPORT_ROWS,
  })
  return { headers: ['Match', 'Category', 'Stand', 'Block', 'Gate', 'Format', 'Face Value', 'Total', 'Reserved', 'Available', 'Allocated', 'Issued', 'Returned', 'Void', 'Quota'], rows: rows.map((row) => [
    row.match.title, row.ticketCategory.displayName, row.standName, row.blockName, row.gateName, row.ticketFormat, row.faceValue?.toString() ?? null,
    row.totalQuantity, row.reservedQuantity, row.availableQuantity, row.allocatedQuantity, row.issuedQuantity, row.returnedQuantity, row.voidQuantity, row.quotaPool?.displayName,
  ]) }
}

async function quotas(tx: Transaction, matchId?: string): Promise<Dataset> {
  const rows = await tx.quotaPool.findMany({
    where: { matchId }, include: { match: { select: { title: true } }, owner: { select: { fullName: true } }, quotaAllocations: { include: { ticketCategory: { select: { displayName: true } } } } },
    orderBy: { name: 'asc' }, take: MAX_EXPORT_ROWS,
  })
  return { headers: ['Match', 'Name', 'Display Name', 'Owner', 'Total Allocation', 'Consumed', 'Active', 'Categories', 'Created At'], rows: rows.map((row) => [
    row.match.title, row.name, row.displayName, row.owner?.fullName, row.totalAllocation, row.consumedQuantity, row.isActive,
    row.quotaAllocations.map((item) => `${item.ticketCategory.displayName}: ${item.allocatedQuantity} (${item.consumedQuantity} used)`).join('; '), row.createdAt,
  ]) }
}

async function distribution(tx: Transaction, matchId?: string, filters: ExportFilters = {}): Promise<Dataset> {
  const rows = await tx.ticketIssuance.findMany({
    where: { matchId, status: textFilter(filters, 'status') }, include: { match: { select: { title: true } }, request: { select: { requestNumber: true } }, batch: { select: { batchNumber: true } } },
    orderBy: { createdAt: 'desc' }, take: MAX_EXPORT_ROWS,
  })
  return { headers: ['Issuance Number', 'Match', 'Request Number', 'Batch', 'Recipient', 'Mobile', 'Category', 'Stand', 'Seats', 'Quantity', 'Method', 'Status', 'Issued At', 'Delivered At'], rows: rows.map((row) => [
    row.issuanceNumber, row.match.title, row.request.requestNumber, row.batch?.batchNumber, row.recipientName, row.recipientMobile,
    row.ticketCategory, row.standName, row.seatDetails, row.quantity, row.distributionMethod, row.status, row.issuedAt, row.deliveredAt,
  ]) }
}

async function audit(tx: Transaction, matchId?: string, filters: ExportFilters = {}): Promise<Dataset> {
  const search = textFilter(filters, 'search')
  const rows = await tx.auditEvent.findMany({
    where: { matchId, action: textFilter(filters, 'action'), ...(search ? { OR: [
      { eventId: { contains: search, mode: 'insensitive' } }, { entityId: { contains: search, mode: 'insensitive' } },
      { entityType: { contains: search, mode: 'insensitive' } }, { user: { email: { contains: search, mode: 'insensitive' } } },
    ] } : {}) }, include: { user: { select: { fullName: true, email: true } }, match: { select: { title: true } } },
    orderBy: { createdAt: 'desc' }, take: MAX_EXPORT_ROWS,
  })
  return { headers: ['Event ID', 'Time', 'User', 'Email', 'Action', 'Entity Type', 'Entity ID', 'Match', 'Old Values', 'New Values', 'Reason'], rows: rows.map((row) => [
    row.eventId, row.createdAt, row.user?.fullName, row.user?.email, row.action, row.entityType, row.entityId, row.match?.title, row.oldValues, row.newValues, row.reason,
  ]) }
}

async function reports(tx: Transaction, matchId?: string): Promise<Dataset> {
  const [requestTotals, inventoryTotals, quotaTotals, categories] = await Promise.all([
    tx.request.aggregate({ where: { matchId }, _sum: { totalRequested: true, totalApproved: true, totalAllocated: true, totalIssued: true, totalDelivered: true } }),
    tx.inventoryPool.aggregate({ where: { matchId }, _sum: { totalQuantity: true, availableQuantity: true } }),
    tx.quotaPool.aggregate({ where: { matchId }, _sum: { totalAllocation: true, consumedQuantity: true } }),
    tx.ticketCategory.findMany({ where: { matchId }, include: { requestItems: true, inventoryPools: true }, orderBy: { sortOrder: 'asc' }, take: MAX_EXPORT_ROWS }),
  ])
  return {
    summary: {
      Requested: requestTotals._sum.totalRequested ?? 0, Approved: requestTotals._sum.totalApproved ?? 0,
      Allocated: requestTotals._sum.totalAllocated ?? 0, Issued: requestTotals._sum.totalIssued ?? 0, Delivered: requestTotals._sum.totalDelivered ?? 0,
      Inventory: inventoryTotals._sum.totalQuantity ?? 0, Available: inventoryTotals._sum.availableQuantity ?? 0,
      'Quota Allocated': quotaTotals._sum.totalAllocation ?? 0, 'Quota Consumed': quotaTotals._sum.consumedQuantity ?? 0,
    },
    headers: ['Category', 'Requested', 'Approved', 'Allocated', 'Issued', 'Available'],
    rows: categories.map((category) => [category.displayName,
      category.requestItems.reduce((sum, item) => sum + item.requestedQuantity, 0), category.requestItems.reduce((sum, item) => sum + item.approvedQuantity, 0),
      category.requestItems.reduce((sum, item) => sum + item.allocatedQuantity, 0), category.requestItems.reduce((sum, item) => sum + item.issuedQuantity, 0),
      category.inventoryPools.reduce((sum, pool) => sum + pool.availableQuantity, 0),
    ]),
  }
}

export async function buildDataset(tx: Transaction, type: ExportType, matchId?: string, filters: ExportFilters = {}): Promise<Dataset> {
  switch (type) {
    case 'REQUESTS': return requests(tx, matchId, filters)
    case 'ALLOCATIONS': return allocations(tx, matchId, filters)
    case 'INVENTORY': return inventory(tx, matchId, filters)
    case 'QUOTAS': return quotas(tx, matchId)
    case 'DISTRIBUTION': return distribution(tx, matchId, filters)
    case 'AUDIT': return audit(tx, matchId, filters)
    case 'REPORTS': {
      const view = detailViews.find(value => value === filters.view)
      return view ? readReportDetail(tx, view, matchId) : reports(tx, matchId)
    }
  }
}

export function exportFileName(type: ExportType, format: ExportFormat, date = new Date()): string {
  return `aca-ticketops-${type.toLowerCase()}-${date.toISOString().slice(0, 10)}.${format.toLowerCase()}`
}
