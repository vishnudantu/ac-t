import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars-long')
const SESSION_NAME = 'aca-ticketops-session'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export interface SessionPayload {
  userId: string
  email: string
  fullName: string
  roles: string[]
  permissions: string[]
  matchId?: string
  departmentId?: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000,
    path: '/',
  })

  return token
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_NAME)?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_NAME)
}

export async function getUserWithPermissions(userId: string, matchId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
        where: {
          isActive: true,
          OR: [
            { matchId: null },
            { matchId: matchId || undefined },
          ],
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true }
              }
            }
          }
        }
      }
    }
  })

  if (!user) return null

  const permissions = new Set<string>()
  const roles = new Set<string>()

  for (const assignment of user.roleAssignments) {
    roles.add(assignment.role.name)
    for (const rp of assignment.role.permissions) {
      permissions.add(rp.permission.key)
    }
  }

  return {
    ...user,
    roles: Array.from(roles),
    permissions: Array.from(permissions),
  }
}

export function hasPermission(permissions: string[], required: string | string[]): boolean {
  const requiredPerms = Array.isArray(required) ? required : [required]
  return requiredPerms.every(p => permissions.includes(p))
}

export function hasRole(roles: string[], required: string | string[]): boolean {
  const requiredRoles = Array.isArray(required) ? required : [required]
  return requiredRoles.some(r => roles.includes(r))
}