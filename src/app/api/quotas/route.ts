import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "quotas:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get("matchId")
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {}
    if (matchId) where.matchId = matchId

    const quotas = await prisma.quotaPool.findMany({
      where,
      include: {
        match: { select: { id: true, title: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        quotaAllocations: {
          include: { ticketCategory: { select: { id: true, name: true, displayName: true } } }
        },
        childQuotas: { select: { id: true, name: true, displayName: true } },
        _count: { select: { quotaTransfersFrom: true, quotaTransfersTo: true } },
      },
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    })

    const total = await prisma.quotaPool.count({ where })

    return NextResponse.json({ quotas, total })
  } catch (error) {
    console.error("Error fetching quotas:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "quotas:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const data = await request.json()

    const quota = await prisma.quotaPool.create({
      data: {
        matchId: data.matchId,
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        ownerId: data.ownerId,
        parentQuotaId: data.parentQuotaId,
        totalAllocation: data.totalAllocation || 0,
      },
      include: { match: true, owner: true },
    })

    // Create quota allocations if provided
    if (data.allocations && Array.isArray(data.allocations)) {
      await prisma.quotaAllocation.createMany({
        data: data.allocations.map((a: any) => ({
          quotaPoolId: quota.id,
          ticketCategoryId: a.ticketCategoryId,
          allocatedQuantity: a.allocatedQuantity || 0,
        }))
      })
    }

    // Create audit log
    await prisma.auditEvent.create({
      data: {
        userId: session.userId,
        entityType: "QUOTA",
        entityId: quota.id,
        action: "CREATE",
        newValues: data,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      },
    })

    return NextResponse.json(quota, { status: 201 })
  } catch (error) {
    console.error("Error creating quota:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}