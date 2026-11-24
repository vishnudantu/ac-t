import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 16
export const PASSWORD_MAX_LENGTH = 128

export const passwordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must contain no more than ${PASSWORD_MAX_LENGTH} characters`)

const optionalProfileText = z.string().trim().max(150).transform((value) => value || null)
const mobileNumber = z.string().trim().max(30).refine((value) => /^\+?[0-9][0-9\s()-]{4,28}$/.test(value), 'Enter a valid mobile number')

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must contain at least 2 characters').max(150),
  mobileNumber: z.union([mobileNumber, z.literal('')]).optional().transform((value) => value || null),
  designation: optionalProfileText.optional(),
  department: optionalProfileText.optional(),
}).strict()

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(1024),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Confirm your new password').max(PASSWORD_MAX_LENGTH),
}).strict().superRefine((input, context) => {
  if (input.currentPassword === input.newPassword) {
    context.addIssue({ code: 'custom', path: ['newPassword'], message: 'New password must differ from the current password' })
  }
  if (input.newPassword !== input.confirmPassword) {
    context.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' })
  }
})

export const passwordResetSchema = z.object({
  newPassword: passwordSchema,
}).strict()

export const profileSelect = {
  id: true, email: true, fullName: true, mobileNumber: true,
  designation: true, department: true, employeeId: true,
} as const

export type ProfileRecord = {
  id: string
  email: string
  fullName: string
  mobileNumber: string | null
  designation: string | null
  department: string | null
  employeeId: string | null
}

/**
 * Audit payloads must never contain credential material. Building them from an
 * explicit allowlist keeps this true even if a select is widened later.
 */
export function auditProfileValues(profile: ProfileRecord): string {
  return JSON.stringify({
    fullName: profile.fullName,
    mobileNumber: profile.mobileNumber,
    designation: profile.designation,
    department: profile.department,
    employeeId: profile.employeeId,
  })
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
}

