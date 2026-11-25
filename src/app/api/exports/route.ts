import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody, withApiHandler } from '@/lib/api'
import { hasPermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { paginationQuerySchema } from '@/lib/validation'
import { buildDataset, datasetToCsv, datasetToXlsx, EXPORT_TYPES, exportFileName, exportPermissions } from '@/lib/export/generators'

const typeSchema = z.enum(EXPORT_TYPES)
const createSchema = z.object({
  type: typeSchema, format: z.enum(['CSV', 'XLSX']).default('CSV'),
  matchId: z.string().trim().min(1).max(200).optional(), filters: z.record(z.string(), z.unknown()).optional(),
}).strict()
const listSchema = paginationQuerySchema.extend({ type: typeSchema.optional() }).strict()
const listPermissions = [...Object.values(exportPermissions), 'requests:bulk_import', 'requests:write', 'inventory:import', 'quotas:write']

export const GET = withApiHandler(async (request, session) => {
  if (!listPermissions.some((permission) => hasPermission(session.permissions, permission))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const query = listSchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const where = { exportType: query.type }
  const [jobs, total] = await prisma.$transaction([
    prisma.exportJob.findMany({ where, include: { match: { select: { id: true, title: true } }, creator: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: query.limit, skip: query.offset }),
    prisma.exportJob.count({ where }),
  ])
  return NextResponse.json({ success: true, jobs, exports: jobs, total })
})

export const POST = withApiHandler(async (request, session) => {
  const data = createSchema.parse(await parseJsonBody(request))
  if (!hasPermission(session.permissions, exportPermissions[data.type])) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const fileName = exportFileName(data.type, data.format)
  const jobNumber = `EXP-${new Date().getUTCFullYear()}-${randomUUID()}`
  const output = await prisma.$transaction(async (tx) => {
    const dataset = await buildDataset(tx, data.type, data.matchId, data.filters)
    const csv = data.format === 'CSV' ? datasetToCsv(dataset) : null
    const bytes = csv === null ? await datasetToXlsx(dataset) : Buffer.from(csv, 'utf8')
    await tx.exportJob.create({ data: {
      jobNumber, matchId: data.matchId, exportType: data.type, format: data.format,
      filters: JSON.stringify({ matchId: data.matchId, ...data.filters }), status: 'COMPLETED',
      fileName, fileSize: bytes.byteLength, recordCount: dataset.rows.length, createdById: session.userId,
    } })
    return bytes
  })
  return new NextResponse(new Uint8Array(output), { headers: {
    'Content-Type': data.format === 'CSV' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fileName}"`, 'Content-Length': String(output.byteLength), 'Cache-Control': 'no-store',
  } })
})
