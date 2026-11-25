import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, parseQueryParams, withApiHandler } from '@/lib/api'
import { hasPermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { paginationQuerySchema } from '@/lib/validation'
import { runImport } from '@/lib/import/job-importer'
import { IMPORT_TYPES, MAX_IMPORT_FILE_SIZE, parseImportFile, type ImportType } from '@/lib/import/parser'

const listSchema = paginationQuerySchema.extend({ type: z.enum(IMPORT_TYPES as [ImportType, ...ImportType[]]).optional() }).strict()
const importPermissions: Record<ImportType, string> = {
  REQUESTS: 'requests:bulk_import', REQUESTERS: 'requests:write', INVENTORY: 'inventory:import', QUOTAS: 'quotas:write',
}
const listPermissions = ['requests:bulk_import', 'requests:write', 'inventory:import', 'quotas:write']

export const GET = withApiHandler(async (request, session) => {
  if (!listPermissions.some((permission) => hasPermission(session.permissions, permission))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const query = listSchema.parse(parseQueryParams(request))
  const where = { importType: query.type }
  const [jobs, total] = await prisma.$transaction([
    prisma.importJob.findMany({
      where, include: { match: { select: { id: true, title: true } }, creator: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' }, take: query.limit, skip: query.offset,
    }),
    prisma.importJob.count({ where }),
  ])
  return NextResponse.json({ success: true, jobs, imports: jobs, total })
})

export const POST = withApiHandler(async (request, session) => {
  let form: FormData
  try { form = await request.formData() } catch { throw new ApiError(400, 'A multipart form with file and type is required') }
  const type = z.enum(IMPORT_TYPES as [ImportType, ...ImportType[]]).safeParse(form.get('type'))
  if (!type.success) throw new ApiError(400, 'Import type must be REQUESTERS, INVENTORY, QUOTAS, or REQUESTS')
  if (!hasPermission(session.permissions, importPermissions[type.data])) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const file = form.get('file')
  if (!(file instanceof File)) throw new ApiError(400, 'Select a CSV or XLSX file')
  const originalName = file.name.toLowerCase()
  const extension = originalName.endsWith('.xlsx') ? 'xlsx' : originalName.endsWith('.csv') ? 'csv' : null
  if (!extension) throw new ApiError(400, 'Only .csv and .xlsx files are accepted')
  if (file.size <= 0 || file.size > MAX_IMPORT_FILE_SIZE) throw new ApiError(400, 'Import files must be between 1 byte and 5MB')
  const buffer = Buffer.from(await file.arrayBuffer())
  const rows = await parseImportFile(buffer, extension, type.data)
  const jobNumber = `IMP-${new Date().getUTCFullYear()}-${randomUUID()}`
  const fileName = `${jobNumber}.${extension}`
  const job = await prisma.$transaction(async (tx) => {
    const result = await runImport(type.data, rows, { tx, userId: session.userId, roles: session.roles })
    const now = new Date()
    const created = await tx.importJob.create({ data: {
      jobNumber, importType: type.data, fileName, fileSize: file.size, storagePath: '', status: result.status,
      totalRows: result.totalRows, validRows: result.validRows, invalidRows: result.invalidRows,
      duplicateRows: result.duplicateRows, importedRows: result.importedRows, errorSummary: result.errorSummary,
      createdById: session.userId, startedAt: now, completedAt: now,
    } })
    await tx.importRow.createMany({ data: result.rows.map((row) => ({
      importJobId: created.id, rowNumber: row.rowNumber, rawData: JSON.stringify(row.data),
      mappedData: row.entityId ? JSON.stringify({ entityType: row.entityType, entityId: row.entityId }) : null,
      status: row.status, errors: row.errors,
    })) })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'IMPORT_JOB', entityId: created.id, action: 'BULK_IMPORT',
      newValues: JSON.stringify({ jobNumber, importType: type.data, totalRows: result.totalRows, importedRows: result.importedRows, status: result.status }),
      changedFields: ['jobNumber', 'importType', 'totalRows', 'importedRows', 'status'],
    } })
    return created
  })
  return NextResponse.json({ success: true, job }, { status: 201 })
})
