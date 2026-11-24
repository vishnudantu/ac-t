import { LoginRateLimiter } from './auth-core'

// Local/single-process limiting only. Production must replace this with a shared
// distributed rate-limit service; this class makes no distributed guarantee.
export const loginRateLimiter = new LoginRateLimiter()

export type AuthRateLimiter = Pick<LoginRateLimiter, 'check' | 'fail' | 'succeed'>

export function loginAttemptKey(request: Request, email: string): string {
  const forwardedAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwardedAddress || 'local'
  return `${address}:${email}`
}
