import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission, hasRole } from "@/lib/auth"

interface RouteContext {
  params: Promise<{ id: string }>
}

const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_ -]+$/, "Use letters, numbers, spaces, hyphens or underscores"),
  displayName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullish(),
  pricingTier: z.number().int().min(0).max(10).default(0),
  sortOrder: z.number().int().min(0).max(999).optional(),
  colorCode: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #1e3a8a").nullish(),
}).strict()

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!hasPermission(session.permissions, "requests:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parsedId = z.string().trim().min(1).max(100).safeParse(id)
    if (!parsedId.success) return NextResponse.json({ error: "Invalid match ID" }, { status: 400 })

    const match = await prisma.match.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 })

    const categories = await prisma.ticketCategory.findMany({
      where: { matchId: id, isActive: true },
      select: {
        id: true,
        matchId: true,
        name: true,
        displayName: true,
        description: true,
        pricingTier: true,
        sortOrder: true,
        colorCode: true,
        _count: { select: { inventoryPools: true, requestItems: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    })

    return NextResponse.json({ categories })
  } catch (error: unknown) {
    console.error("Error fetching match categories:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!hasPermission(session.permissions, "matches:write") && !hasPermission(session.permissions, "matches:configure")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const matchId = z.string().trim().min(1).max(100).parse(id)
    const input = categoryCreateSchema.parse(await request.json())

    const category = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({ where: { id: matchId }, select: { id: true, title: true } })
      if (!match) return null
      const created = await tx.ticketCategory.create({
        data: {
          matchId,
          name: input.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
          displayName: input.displayName,
          description: input.description ?? null,
          pricingTier: input.pricingTier,
          sortOrder: input.sortOrder ?? 0,
          colorCode: input.colorCode ?? null,
        },
      })
      await tx.auditEvent.create({ data: {
        userId: session.userId, matchId, entityType: "TICKET_CATEGORY", entityId: created.id, action: "CREATE",
        newValues: JSON.stringify({ name: created.name, displayName: created.displayName }), changedFields: ["name", "displayName"],
      } })
      return created
    })
    if (!category) return NextResponse.json({ error: "Match not found" }, { status: 404 })
    return NextResponse.json({ category }, { status: 201 })
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A category with this name already exists for the match" }, { status: 409 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid category details" }, { status: 400 })
    }
    console.error("Error creating ticket category:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
