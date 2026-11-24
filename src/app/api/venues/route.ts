import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const venueSchema = z.object({
  name: z.string().trim().min(2).max(250),
  shortName: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100).default('India'),
  capacity: z.number().int().positive().max(2_000_000).nullish(),
}).strict()

export const GET = withApiHandler(async (_request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'matches:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venues = await prisma.venue.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 200 })
  return NextResponse.json({ success: true, venues })
})

export const POST = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'matches:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const data = venueSchema.parse(await request.json())
  const venue = await prisma.venue.create({ data })
  return NextResponse.json({ success: true, venue }, { status: 201 })
})
