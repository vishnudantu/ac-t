import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import type { SessionPayload } from './auth-core'
export type { SessionPayload } from './auth-core'
import {
  getJwtSecret,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_DURATION_SECONDS,
  verifySessionToken,
  type SessionTokenClaims,
} from './auth-core'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(
  identity: Pick<SessionTokenClaims, 'userId'> & Partial<Pick<SessionTokenClaims, 'sessionId'>>,
): Promise<string> {
  const sessionId = identity.sessionId ?? randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(sessionId)
    .setSubject(identity.userId)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecret())

  await prisma.sessionToken.create({
    data: {
      id: sessionId,
      userId: identity.userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_SECONDS,
    path: '/',
  })

  return token
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const claims = await verifySessionToken(token)
  if (!claims) return null

  const storedSession = await prisma.sessionToken.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, userId: true, expiresAt: true },
  })
  if (
    !storedSession ||
    storedSession.id !== claims.sessionId ||
    storedSession.userId !== claims.userId ||
    storedSession.expiresAt.getTime() <= Date.now()
  ) return null

  const user = await getUserWithPermissions(claims.userId)
  if (!user?.isActive) return null

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
    permissions: user.permissions,
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const claims = token ? await verifySessionToken(token) : null

  if (token && claims) {
    await prisma.sessionToken.deleteMany({
      where: { id: claims.sessionId, userId: claims.userId, tokenHash: hashSessionToken(token) },
    })
  }
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function getUserWithPermissions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
        where: {
          isActive: true,
          scope: 'GLOBAL',
          matchId: null,
          role: { isActive: true },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  })

  if (!user) return null

  const permissions = new Set<string>()
  const roles = new Set<string>()
  for (const assignment of user.roleAssignments) {
    roles.add(assignment.role.name)
    for (const rolePermission of assignment.role.permissions) {
      permissions.add(rolePermission.permission.key)
    }
  }

  return {
    ...user,
    roles: Array.from(roles),
    permissions: Array.from(permissions),
  }
}

export function hasPermission(permissions: string[], required: string | string[]): boolean {
  const requiredPermissions = Array.isArray(required) ? required : [required]
  return requiredPermissions.every((permission) => permissions.includes(permission))
}

export function hasRole(roles: string[], required: string | string[]): boolean {
  const requiredRoles = Array.isArray(required) ? required : [required]
  return requiredRoles.some((role) => roles.includes(role))
}
