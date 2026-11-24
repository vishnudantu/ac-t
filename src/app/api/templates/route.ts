import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const templateSchema = z.enum(['requests', 'requesters', 'inventory', 'quotas', 'distribution'])

const templates: Record<z.infer<typeof templateSchema>, { headers: string[]; sample: (string | number)[]; notes: string[] }> = {
  requests: {
    headers: ['Requester Mobile', 'Requester Name', 'Match Title', 'Ticket Category', 'Requested Quantity', 'Source', 'Priority', 'Notes'],
    sample: ['+919876500001', 'Dr. S. Ramesh', 'India vs Australia - 2nd ODI', 'VIP', 2, 'IN_PERSON', 'NORMAL', 'Protocol clearance requested'],
    notes: [
      'Requester Mobile must match an existing requester; the requester is created automatically if the name is supplied.',
      'Match Title and Ticket Category must match an existing match and category exactly.',
      'Requested Quantity must be a positive whole number.',
      'Source: IN_PERSON, EMAIL, WHATSAPP, LETTER, PHONE, ONLINE_FORM, INTERNAL.',
      'Priority: LOW, NORMAL, HIGH, PROTOCOL.',
    ],
  },
  requesters: {
    headers: ['Full Name', 'Mobile Number', 'Email', 'Designation', 'Organisation', 'Category', 'Protocol Level', 'Preferred Contact'],
    sample: ['Mr. K. Venkatesh', '+919876500002', 'venkatesh@aca.gov.in', 'Secretary', 'Andhra Cricket Association', 'VIP', 2, 'PHONE'],
    notes: [
      'Mobile Number must be unique per organisation and start with an optional + country code.',
      'Organisation is created automatically when it does not exist.',
      'Category: VIP, OFFICIAL, BCCI, GOVERNMENT, SPONSOR, MEDIA, MEMBER, STAFF, GENERAL.',
      'Preferred Contact: PHONE, EMAIL, WHATSAPP.',
    ],
  },
  inventory: {
    headers: ['Match Title', 'Ticket Category', 'Stand Name', 'Block Name', 'Gate Name', 'Ticket Format', 'Face Value', 'Total Quantity', 'Notes'],
    sample: ['India vs Australia - 2nd ODI', 'VIP', 'VIP Pavilion', 'A', 'Gate 1', 'PHYSICAL', 5000, 500, 'Includes lounge access'],
    notes: [
      'Match Title and Ticket Category must match an existing match and category exactly.',
      'Ticket Format: PHYSICAL, DIGITAL, BOTH.',
      'Face Value is an optional decimal amount; leave blank when the ticket is complimentary.',
      'Total Quantity must be a positive whole number and becomes the available stock.',
    ],
  },
  quotas: {
    headers: ['Match Title', 'Quota Name', 'Display Name', 'Ticket Category', 'Allocated Quantity', 'Description'],
    sample: ['India vs Australia - 2nd ODI', 'ACA_OFFICIALS', 'ACA Officials', 'VIP', 1000, 'ACA office bearers'],
    notes: [
      'Quota Name must be unique per match; an existing quota is reused when the name matches.',
      'Ticket Category must belong to the same match.',
      'Allocated Quantity must be a positive whole number.',
    ],
  },
  distribution: {
    headers: ['Request Number', 'Recipient Name', 'Recipient Mobile', 'Distribution Method', 'Quantity', 'Seat Details', 'Notes'],
    sample: ['REQ-2026-0001', 'Dr. S. Ramesh', '+919876500001', 'PERSONAL_COLLECTION', 2, 'VIP Pavilion A, Row 3', 'Collected in person'],
    notes: [
      'Request Number must belong to a confirmed allocation.',
      'Distribution Method: PHYSICAL, DIGITAL, BOTH.',
      'Quantity must not exceed the remaining approved quantity.',
    ],
  },
}

function csvCell(value: string | number): string {
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, ['requests:bulk_import', 'inventory:import', 'requests:write'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const type = templateSchema.safeParse(request.nextUrl.searchParams.get('type'))
  if (!type.success) {
    return NextResponse.json({ error: 'Unknown template type. Use requests, requesters, inventory, quotas, or distribution.' }, { status: 400 })
  }
  const template = templates[type.data]
  const rows = [template.headers, template.sample]
  const body = `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="aca-ticketops-${type.data}-template.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})
