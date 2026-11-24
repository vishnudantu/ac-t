import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"

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
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    })

    return NextResponse.json({ categories })
  } catch (error: unknown) {
    console.error("Error fetching match categories:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
