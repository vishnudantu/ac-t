import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "inventory:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get("matchId")
    const categoryId = searchParams.get("categoryId")
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {}
    if (matchId) where.matchId = matchId
    if (categoryId) where.ticketCategoryId = categoryId

    const inventory = await prisma.inventoryPool.findMany({
      where,
      include: {
        match: { select: { id: true, title: true } },
        ticketCategory: { select: { id: true, name: true, displayName: true, colorCode: true } },
        quotaPool: { select: { id: true, name: true, displayName: true } },
        _count: { select: { ticketSerials: true, allocations: true } },
      },
      orderBy: [{ matchId: "asc" }, { ticketCategory: { sortOrder: "asc" } }, { standName: "asc" }],
      take: limit,
      skip: offset,
    })

    const total = await prisma.inventoryPool.count({ where })

    // Calculate summary
    const summary = inventory.reduce((acc: { total: number; reserved: number; available: number; allocated: number; issued: number; returned: number; void: number }, item: { totalQuantity: number; reservedQuantity: number; availableQuantity: number; allocatedQuantity: number; issuedQuantity: number; returnedQuantity: number; voidQuantity: number }) => ({
      total: acc.total + item.totalQuantity,
      reserved: acc.reserved + item.reservedQuantity,
      available: acc.available + item.availableQuantity,
      allocated: acc.allocated + item.allocatedQuantity,
      issued: acc.issued + item.issuedQuantity,
      returned: acc.returned + item.returnedQuantity,
      void: acc.void + item.voidQuantity,
    }), { total: 0, reserved: 0, available: 0, allocated: 0, issued: 0, returned: 0, void: 0 })

    return NextResponse.json({ inventory, total, summary })
  } catch (error) {
    console.error("Error fetching inventory:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "inventory:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const data = await request.json()

    const inventory = await prisma.inventoryPool.create({
      data: {
        matchId: data.matchId,
        ticketCategoryId: data.ticketCategoryId,
        standName: data.standName,
        blockName: data.blockName,
        gateName: data.gateName,
        rowStart: data.rowStart,
        rowEnd: data.rowEnd,
        seatStart: data.seatStart,
        seatEnd: data.seatEnd,
        ticketFormat: data.ticketFormat || "PHYSICAL",
        faceValue: data.faceValue,
        pricingCategory: data.pricingCategory,
        totalQuantity: data.totalQuantity || 0,
        reservedQuantity: data.reservedQuantity || 0,
        availableQuantity: data.availableQuantity || data.totalQuantity || 0,
        isQuotaPool: data.isQuotaPool || false,
        quotaPoolId: data.quotaPoolId,
        notes: data.notes,
      },
      include: { ticketCategory: true, match: true },
    })

    // Create audit log
    await prisma.auditEvent.create({
      data: {
        userId: session.userId,
        entityType: "INVENTORY",
        entityId: inventory.id,
        action: "CREATE",
        newValues: data,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      },
    })

    return NextResponse.json(inventory, { status: 201 })
  } catch (error) {
    console.error("Error creating inventory:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}