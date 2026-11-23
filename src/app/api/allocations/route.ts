import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"
import { generateAllocationNumber } from "@/lib/utils"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "allocations:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get("matchId")
    const requestId = searchParams.get("requestId")
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {}
    if (matchId) where.matchId = matchId
    if (requestId) where.requestId = requestId
    if (status && status !== "all") where.status = status

    const allocations = await prisma.allocation.findMany({
      where,
      include: {
        match: { select: { id: true, title: true } },
        request: { select: { id: true, requestNumber: true, requester: { select: { fullName: true } } } },
        officer: { select: { id: true, fullName: true } },
        items: {
          include: {
            ticketCategory: { select: { id: true, name: true, displayName: true } },
            inventoryPool: { select: { id: true, standName: true, blockName: true } },
            requestItem: { select: { requestedQuantity: true, approvedQuantity: true } },
          }
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    })

    const total = await prisma.allocation.count({ where })

    return NextResponse.json({ allocations, total })
  } catch (error) {
    console.error("Error fetching allocations:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "allocations:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const data = await request.json()

    const allocationNumber = generateAllocationNumber()

    const allocation = await prisma.allocation.create({
      data: {
        allocationNumber,
        matchId: data.matchId,
        requestId: data.requestId,
        officerId: session.userId,
        status: data.status || "DRAFT",
        totalQuantity: data.totalQuantity || 0,
        notes: data.notes,
        items: {
          create: data.items?.map((item: any) => ({
            requestItemId: item.requestItemId,
            inventoryPoolId: item.inventoryPoolId,
            ticketCategoryId: item.ticketCategoryId,
            quantity: item.quantity,
            standName: item.standName,
            blockName: item.blockName,
            seatDetails: item.seatDetails,
            serialRangeStart: item.serialRangeStart,
            serialRangeEnd: item.serialRangeEnd,
            isFromQuota: item.isFromQuota || false,
            quotaPoolId: item.quotaPoolId,
            status: item.status || "RESERVED",
          })) || [],
        },
      },
      include: { items: { include: { ticketCategory: true, inventoryPool: true } } },
    })

    // Create audit log
    await prisma.auditEvent.create({
      data: {
        userId: session.userId,
        entityType: "ALLOCATION",
        entityId: allocation.id,
        action: "CREATE",
        newValues: { allocationNumber, ...data },
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      },
    })

    return NextResponse.json(allocation, { status: 201 })
  } catch (error) {
    console.error("Error creating allocation:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}