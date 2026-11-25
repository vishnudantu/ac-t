import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ApiError } from '@/lib/api'
import { hasRole } from '@/lib/auth'
import { assertQuotaCapacity } from '@/lib/capacity'
import { generateRequestNumber } from '@/lib/utils'
import { MAX_IMPORTED_ROWS, type ImportType, type ParsedRow } from './parser'

type Transaction = Prisma.TransactionClient
type RowStatus = 'IMPORTED' | 'INVALID' | 'DUPLICATE'

export interface ImportRowResult {
  rowNumber: number
  data: ParsedRow
  errors: string | null
  status: RowStatus
  entityType: string | null
  entityId: string | null
}

export interface ImportResult {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  importedRows: number
  rows: ImportRowResult[]
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  errorSummary: string | null
}

interface ExecutorContext {
  tx: Transaction
  userId: string
  roles: string[]
}

const optional = (value: string | undefined): string | undefined => value?.trim() || undefined
const required = (value: string | undefined, name: string): string => {
  if (!value?.trim()) throw new ApiError(422, `${name} is required`)
  return value.trim()
}
const numberValue = (value: string | undefined, name: string, integer = true): number => {
  const number = Number(value)
  if (!value || !Number.isFinite(number) || (integer && !Number.isInteger(number)) || number <= 0) {
    throw new ApiError(422, `${name} must be a positive ${integer ? 'whole number' : 'number'}`)
  }
  return number
}
const enumValue = <T extends string>(value: string | undefined, values: readonly T[], name: string, fallback: T): T => {
  const normalized = optional(value)?.toUpperCase() || fallback
  if (!values.includes(normalized as T)) throw new ApiError(422, `${name} must be one of: ${values.join(', ')}`)
  return normalized as T
}


const REQUESTER_CATEGORIES = ['VIP', 'OFFICIAL', 'BCCI', 'GOVERNMENT', 'SPONSOR', 'MEDIA', 'MEMBER', 'STAFF', 'GENERAL'] as const

const requesterSchema = z.object({
  fullName: z.string().min(2).max(150), mobileNumber: z.string().regex(/^\+?[0-9][0-9\s-]{7,17}$/),
  email: z.string().email().max(254).optional(), designation: z.string().max(150).optional(),
  organisation: z.string().min(2).max(200), category: z.enum(REQUESTER_CATEGORIES),
  protocolLevel: z.number().int().min(0).max(10).default(0), preferredContact: z.enum(['PHONE', 'EMAIL', 'WHATSAPP']).default('PHONE'),
})

async function executeRequester(row: ParsedRow, { tx }: ExecutorContext): Promise<{ entityType: string; entityId: string } | null> {
  const parsed = requesterSchema.safeParse({
    fullName: required(row['Full Name'], 'Full Name'), mobileNumber: required(row['Mobile Number'], 'Mobile Number'),
    email: optional(row.Email), designation: optional(row.Designation), organisation: required(row.Organisation, 'Organisation'),
    category: required(row.Category, 'Category').toUpperCase(), protocolLevel: row['Protocol Level'] ? Number(row['Protocol Level']) : 0,
    preferredContact: enumValue(row['Preferred Contact'], ['PHONE', 'EMAIL', 'WHATSAPP'], 'Preferred Contact', 'PHONE'),
  })
  if (!parsed.success) throw new ApiError(422, parsed.error.issues.map((issue) => issue.message).join('; '))
  const organisation = await tx.organisation.upsert({
    where: { name: parsed.data.organisation }, update: {},
    create: { name: parsed.data.organisation, category: parsed.data.category }, select: { id: true },
  })
  const existing = await tx.requester.findFirst({ where: { mobileNumber: parsed.data.mobileNumber, organisationId: organisation.id }, select: { id: true } })
  if (existing) return null
  const requester = await tx.requester.create({ data: {
    fullName: parsed.data.fullName, mobileNumber: parsed.data.mobileNumber, email: parsed.data.email || null,
    designation: parsed.data.designation || null, organisationId: organisation.id, requesterCategory: parsed.data.category,
    protocolLevel: parsed.data.protocolLevel, contactPreference: parsed.data.preferredContact,
  }, select: { id: true } })
  return { entityType: 'REQUESTER', entityId: requester.id }
}

async function resolveMatchAndCategory(tx: Transaction, row: ParsedRow): Promise<{ matchId: string; categoryId: string }> {
  const matchTitle = required(row['Match Title'], 'Match Title')
  const categoryName = required(row['Ticket Category'], 'Ticket Category')
  const match = await tx.match.findFirst({ where: { title: matchTitle }, select: { id: true } })
  if (!match) throw new ApiError(422, 'Match Title does not match an existing match')
  const category = await tx.ticketCategory.findFirst({ where: { matchId: match.id, name: categoryName, isActive: true }, select: { id: true } })
    || await tx.ticketCategory.findFirst({ where: { matchId: match.id, displayName: categoryName, isActive: true }, select: { id: true } })
  if (!category) throw new ApiError(422, 'Ticket Category must be active and belong to the match')
  return { matchId: match.id, categoryId: category.id }
}

async function executeInventory(row: ParsedRow, { tx }: ExecutorContext): Promise<{ entityType: string; entityId: string }> {
  const { matchId, categoryId } = await resolveMatchAndCategory(tx, row)
  const totalQuantity = numberValue(row['Total Quantity'], 'Total Quantity')
  const inventory = await tx.inventoryPool.create({ data: {
    matchId, ticketCategoryId: categoryId, standName: required(row['Stand Name'], 'Stand Name'),
    blockName: optional(row['Block Name']), gateName: optional(row['Gate Name']),
    ticketFormat: enumValue(row['Ticket Format'], ['PHYSICAL', 'DIGITAL', 'BOTH'], 'Ticket Format', 'PHYSICAL'),
    faceValue: optional(row['Face Value']), totalQuantity, availableQuantity: totalQuantity, reservedQuantity: 0, notes: optional(row.Notes),
  }, select: { id: true } })
  await tx.match.update({ where: { id: matchId }, data: { totalInventory: { increment: totalQuantity } } })
  return { entityType: 'INVENTORY_POOL', entityId: inventory.id }
}

async function executeQuota(row: ParsedRow, { tx }: ExecutorContext): Promise<{ entityType: string; entityId: string }> {
  const { matchId, categoryId } = await resolveMatchAndCategory(tx, row)
  const name = required(row['Quota Name'], 'Quota Name')
  const quantity = numberValue(row['Allocated Quantity'], 'Allocated Quantity')
  await assertQuotaCapacity(tx, matchId, categoryId, quantity).catch((error: unknown) => { throw new ApiError(422, error instanceof Error ? error.message : 'Quota capacity exceeded') })
  const existing = await tx.quotaPool.findUnique({ where: { matchId_name: { matchId, name } }, select: { id: true, totalAllocation: true } })
  const quota = existing
    ? await tx.quotaPool.update({ where: { id: existing.id }, data: { totalAllocation: { increment: quantity } }, select: { id: true } })
    : await tx.quotaPool.create({ data: { matchId, name, displayName: required(row['Display Name'], 'Display Name'), description: optional(row.Description), totalAllocation: quantity }, select: { id: true } })
  const existingAllocation = existing
    ? await tx.quotaAllocation.findUnique({ where: { quotaPoolId_ticketCategoryId: { quotaPoolId: quota.id, ticketCategoryId: categoryId } }, select: { id: true } })
    : null
  if (existingAllocation) {
    await tx.quotaAllocation.update({ where: { id: existingAllocation.id }, data: { allocatedQuantity: { increment: quantity } } })
  } else {
    await tx.quotaAllocation.create({ data: { quotaPoolId: quota.id, ticketCategoryId: categoryId, allocatedQuantity: quantity } })
  }
  return { entityType: 'QUOTA_POOL', entityId: quota.id }
}

async function executeRequest(row: ParsedRow, { tx, userId, roles }: ExecutorContext): Promise<{ entityType: string; entityId: string } | null> {
  const { matchId, categoryId } = await resolveMatchAndCategory(tx, row)
  const mobile = required(row['Requester Mobile'], 'Requester Mobile')
  const requesterName = required(row['Requester Name'], 'Requester Name')
  const requester = await tx.requester.findFirst({ where: { mobileNumber: mobile, isActive: true }, select: { id: true } })
    || await tx.requester.create({ data: { fullName: requesterName, mobileNumber: mobile, requesterCategory: 'GENERAL' }, select: { id: true } })
  const quantity = numberValue(row['Requested Quantity'], 'Requested Quantity')
  const source = enumValue(row.Source, ['IN_PERSON', 'EMAIL', 'WHATSAPP', 'LETTER', 'PHONE', 'ONLINE_FORM', 'INTERNAL'], 'Source', 'IN_PERSON')
  const priority = enumValue(row.Priority, ['LOW', 'NORMAL', 'HIGH', 'PROTOCOL'], 'Priority', 'NORMAL')
  const duplicates = await tx.request.findMany({ where: {
    requesterId: requester.id, matchId, status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED'] }, items: { some: { ticketCategoryId: categoryId } },
  }, select: { id: true }, take: 1 })
  if (duplicates.length && !hasRole(roles, ['SUPER_ADMIN', 'APPROVAL_AUTHORITY', 'MATCH_ADMIN'])) return null
  const requestNumber = generateRequestNumber()
  const created = await tx.request.create({ data: {
    requestNumber, matchId, requesterId: requester.id, createdById: userId, source, priority, status: 'DRAFT', fulfilmentStatus: 'PENDING',
    specialInstructions: optional(row.Notes), totalRequested: quantity,
    items: { create: [{ ticketCategoryId: categoryId, requestedQuantity: quantity, requesterId: requester.id }] },
  }, select: { id: true } })
  return { entityType: 'REQUEST', entityId: created.id }
}

const executors: Record<ImportType, (row: ParsedRow, context: ExecutorContext) => Promise<{ entityType: string; entityId: string } | null>> = {
  REQUESTERS: executeRequester, INVENTORY: executeInventory, QUOTAS: executeQuota, REQUESTS: executeRequest,
}

export async function runImport(type: ImportType, rows: ParsedRow[], context: ExecutorContext): Promise<ImportResult> {
  const results: ImportRowResult[] = []
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2
    if (results.filter((result) => result.status === 'IMPORTED').length >= MAX_IMPORTED_ROWS) {
      results.push({ rowNumber, data: row, errors: `Import limit of ${MAX_IMPORTED_ROWS} rows exceeded`, status: 'INVALID', entityType: null, entityId: null })
      continue
    }
    try {
      const entity = await executors[type](row, context)
      results.push({ rowNumber, data: row, errors: entity ? null : 'A matching record already exists', status: entity ? 'IMPORTED' : 'DUPLICATE', entityType: entity?.entityType ?? type, entityId: entity?.entityId ?? null })
    } catch (error: unknown) {
      if (!(error instanceof ApiError)) throw error
      results.push({ rowNumber, data: row, errors: error.message, status: 'INVALID', entityType: null, entityId: null })
    }
  }
  const importedRows = results.filter((row) => row.status === 'IMPORTED').length
  const invalidRows = results.filter((row) => row.status === 'INVALID').length
  const duplicateRows = results.filter((row) => row.status === 'DUPLICATE').length
  const errors = results.filter((row) => row.errors).map((row) => `Row ${row.rowNumber}: ${row.errors}`)
  return {
    totalRows: rows.length, validRows: importedRows + duplicateRows, invalidRows, duplicateRows, importedRows, rows: results,
    status: importedRows === 0 && invalidRows > 0 ? 'FAILED' : invalidRows + duplicateRows > 0 ? 'PARTIAL' : 'COMPLETED',
    errorSummary: invalidRows > 0 ? `${invalidRows} row(s) invalid. ${duplicateRows} duplicate(s).\n${errors.slice(0, 20).join('\n')}` : null,
  }
}