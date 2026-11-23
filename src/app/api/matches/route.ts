import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "matches:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {}
    if (status && status !== "all") {
      where.status = status
    }

    const matches = await prisma.match.findMany({
      where,
      include: {
        venue: true,
        matchAdmin: { select: { id: true, fullName: true, email: true } },
        _count: {
          select: { requests: true, ticketCategories: true, inventoryPools: true },
        },
      },
      orderBy: { matchDate: "desc" },
      take: limit,
      skip: offset,
    })

    const total = await prisma.match.count({ where })

    return NextResponse.json({ matches, total })
  } catch (error) {
    console.error("Error fetching matches:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "matches:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const data = await request.json()

    const match = await prisma.match.create({
      data: {
        title: data.title,
        tournament: data.tournament,
        format: data.format,
        matchDate: new Date(data.matchDate),
        startTime: data.startTime,
        venueId: data.venueId,
        status: data.status || "UPCOMING",
        requestOpensAt: data.requestOpensAt ? new Date(data.requestOpensAt) : null,
        requestClosesAt: data.requestClosesAt ? new Date(data.requestClosesAt) : null,
        approvalDeadline: data.approvalDeadline ? new Date(data.approvalDeadline) : null,
        allocationDeadline: data.allocationDeadline ? new Date(data.allocationDeadline) : null,
        distributionDeadline: data.distributionDeadline ? new Date(data.distributionDeadline) : null,
        matchAdminId: data.matchAdminId || session.userId,
        totalInventory: data.totalInventory || 0,
        notes: data.notes,
        restrictions: data.restrictions,
        operationalInstructions: data.operationalInstructions,
      },
      include: { venue: true },
    })

    // Create audit log
    await prisma.auditEvent.create({
      data: {
        userId: session.userId,
        entityType: "MATCH",
        entityId: match.id,
        action: "CREATE",
        newValues: data,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      },
    })

    return NextResponse.json(match, { status: 201 })
  } catch (error) {
    console.error("Error creating match:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}