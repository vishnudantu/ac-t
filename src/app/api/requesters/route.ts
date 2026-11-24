import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSession, hasPermission } from "@/lib/auth"

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  organisationId: z.string().trim().min(1).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict()

const requesterCreateSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the requester’s full name").max(150),
  mobileNumber: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,17}$/, "Enter a valid mobile number"),
  email: z.string().trim().max(254).email("Enter a valid email address").or(z.literal("")).optional(),
  designation: z.string().trim().max(150).optional(),
  organisationId: z.string().trim().min(1).optional(),
  organisationName: z.string().trim().min(2).max(200).optional(),
  organisationCategory: z.string().trim().max(100).optional(),
  requesterCategory: z.string().trim().min(1, "Select a requester category").max(100),
  protocolLevel: z.coerce.number().int().min(0).max(10).default(0),
  contactPreference: z.enum(["PHONE", "EMAIL", "WHATSAPP"]).default("PHONE"),
  specialInstructions: z.string().trim().max(2000).optional(),
  internalNotes: z.string().trim().max(2000).optional(),
}).strict()

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!hasPermission(session.permissions, "requests:read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parsedQuery = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query parameters", details: parsedQuery.error.flatten() }, { status: 400 })
    }
    const { search, category, organisationId, active, limit, offset } = parsedQuery.data
    const where: Prisma.RequesterWhereInput = {
      ...(active !== "all" ? { isActive: active === "true" } : {}),
      ...(category && category !== "all" ? { requesterCategory: category } : {}),
      ...(organisationId ? { organisationId } : {}),
      ...(search ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { mobileNumber: { contains: search } },
          { email: { contains: search, mode: "insensitive" } },
          { designation: { contains: search, mode: "insensitive" } },
          { organisation: { name: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    }

    const [requesters, total, organisations] = await Promise.all([
      prisma.requester.findMany({
        where,
        include: {
          organisation: { select: { id: true, name: true, category: true } },
          _count: { select: { requests: true } },
          requests: {
            select: { totalRequested: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.requester.count({ where }),
      prisma.organisation.findMany({
        where: { isActive: true },
        select: { id: true, name: true, category: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
    ])

    const requesterIds = requesters.map((requester) => requester.id)
    const ticketTotals = requesterIds.length > 0 ? await prisma.request.groupBy({
      by: ["requesterId"],
      where: { requesterId: { in: requesterIds } },
      _sum: { totalRequested: true },
    }) : []
    const ticketTotalsByRequester = new Map(ticketTotals.map((item) => [item.requesterId, item._sum.totalRequested || 0]))

    return NextResponse.json({
      requesters: requesters.map(({ requests: latestRequest, ...requester }) => ({
        ...requester,
        latestRequest: latestRequest[0] || null,
        totalTickets: ticketTotalsByRequester.get(requester.id) || 0,
      })),
      total,
      organisations,
    })
  } catch (error: unknown) {
    console.error("Error fetching requesters:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!hasPermission(session.permissions, "requests:write")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parsedBody = requesterCreateSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid requester details", details: parsedBody.error.flatten() }, { status: 400 })
    }
    const data = parsedBody.data
    if (!data.organisationId && !data.organisationName) {
      return NextResponse.json({ error: "Select an organisation or enter a new organisation name" }, { status: 400 })
    }

    const requester = await prisma.$transaction(async (transaction) => {
      let organisationId = data.organisationId
      if (!organisationId && data.organisationName) {
        const organisation = await transaction.organisation.upsert({
          where: { name: data.organisationName },
          update: {},
          create: {
            name: data.organisationName,
            category: data.organisationCategory || data.requesterCategory,
          },
          select: { id: true },
        })
        organisationId = organisation.id
      }

      return transaction.requester.create({
        data: {
          fullName: data.fullName,
          mobileNumber: data.mobileNumber,
          email: data.email || null,
          designation: data.designation || null,
          organisationId: organisationId || null,
          requesterCategory: data.requesterCategory,
          protocolLevel: data.protocolLevel,
          contactPreference: data.contactPreference,
          specialInstructions: data.specialInstructions || null,
          internalNotes: data.internalNotes || null,
        },
        include: {
          organisation: { select: { id: true, name: true, category: true } },
          _count: { select: { requests: true } },
        },
      })
    })

    return NextResponse.json({ requester }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A requester with this mobile number already exists for the organisation" }, { status: 409 })
    }
    console.error("Error creating requester:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
