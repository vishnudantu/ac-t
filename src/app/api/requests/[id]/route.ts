import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"

const requestIdSchema = z.string().trim().min(1).max(100)

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!hasPermission(session.permissions, "requests:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parsedId = requestIdSchema.safeParse(id)
    if (!parsedId.success) return NextResponse.json({ error: "Invalid request ID" }, { status: 400 })

    const requestRecord = await prisma.request.findUnique({
      where: { id: parsedId.data },
      include: {
        match: {
          include: { venue: { select: { id: true, name: true, city: true, state: true } } },
        },
        requester: { include: { organisation: { select: { id: true, name: true, category: true } } } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        items: {
          include: { ticketCategory: { select: { id: true, name: true, displayName: true } } },
          orderBy: { ticketCategory: { sortOrder: "asc" } },
        },
        _count: { select: { attachments: true, comments: true, approvalSteps: true } },
      },
    })

    if (!requestRecord) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    return NextResponse.json({ request: requestRecord })
  } catch (error: unknown) {
    console.error("Error fetching request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
