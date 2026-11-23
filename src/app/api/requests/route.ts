import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"
import { generateRequestNumber } from "@/lib/utils"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "requests:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get("matchId")
    const status = searchParams.get("status")
    const requesterId = searchParams.get("requesterId")
    const assignedToId = searchParams.get("assignedToId")
    const search = searchParams.get("search")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {}

    // Apply match filter if user doesn't have global access
    if (matchId) {
      where.matchId = matchId
    }

    if (status && status !== "all") {
      where.status = status
    }

    if (requesterId) {
      where.requesterId = requesterId
    }

    if (assignedToId) {
      where.assignedToId = assignedToId
    }

    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: "insensitive" } },
        { requester: { fullName: { contains: search, mode: "insensitive" } } },
        { requester: { mobileNumber: { contains: search } } },
        { requester: { email: { contains: search, mode: "insensitive" } } },
      ]
    }

    const requests = await prisma.request.findMany({
      where,
      include: {
        match: { select: { id: true, title: true, matchDate: true } },
        requester: { select: { id: true, fullName: true, mobileNumber: true, email: true, organisation: { select: { name: true } } } },
        createdBy: { select: { id: true, fullName: true } },
        assignedTo: { select: { id: true, fullName: true } },
        items: {
          include: { ticketCategory: { select: { id: true, name: true, displayName: true } } }
        },
        _count: { select: { attachments: true, comments: true, approvalSteps: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    })

    const total = await prisma.request.count({ where })

    return NextResponse.json({ requests, total })
  } catch (error) {
    console.error("Error fetching requests:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(session.permissions, "requests:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const data = await request.json()

    // Generate request number
    const requestNumber = generateRequestNumber()

    // Calculate totals
    const items = data.items || []
    const totalRequested = items.reduce((sum: number, item: any) => sum + (item.requestedQuantity || 0), 0)

    const newRequest = await prisma.request.create({
      data: {
        requestNumber,
        matchId: data.matchId,
        requesterId: data.requesterId,
        createdById: session.userId,
        assignedToId: data.assignedToId,
        source: data.source,
        sourceReference: data.sourceReference,
        priority: data.priority || "NORMAL",
        protocolClassification: data.protocolClassification,
        status: data.status || "DRAFT",
        fulfilmentStatus: "PENDING",
        requiredDeliveryMethod: data.requiredDeliveryMethod,
        preferredStand: data.preferredStand,
        preferredType: data.preferredType,
        purpose: data.purpose,
        specialInstructions: data.specialInstructions,
        internalNotes: data.internalNotes,
        totalRequested,
        totalApproved: 0,
        totalAllocated: 0,
        totalIssued: 0,
        totalDelivered: 0,
        items: {
          create: items.map((item: any) => ({
            requesterId: item.requesterId || data.requesterId,
            ticketCategoryId: item.ticketCategoryId,
            requestedQuantity: item.requestedQuantity,
            preferredStand: item.preferredStand,
            preferredBlock: item.preferredBlock,
            priority: item.priority || 0,
            notes: item.notes,
          }))
        },
      },
      include: {
        items: { include: { ticketCategory: true } },
        requester: true,
        match: true,
      },
    })

    // Create audit log
    await prisma.auditEvent.create({
      data: {
        userId: session.userId,
        entityType: "REQUEST",
        entityId: newRequest.id,
        action: "CREATE",
        newValues: { requestNumber: newRequest.requestNumber, ...data },
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      },
    })

    // Trigger approval workflow if submitted
    if (data.status === "SUBMITTED") {
      // In real app, trigger workflow
    }

    return NextResponse.json(newRequest, { status: 201 })
  } catch (error) {
    console.error("Error creating request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}