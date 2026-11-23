"use client"

import { useState, useEffect } from "react"

interface SessionPayload {
  userId: string
  email: string
  fullName: string
  roles: string[]
  permissions: string[]
  matchId?: string
  departmentId?: string
}

export function useSession() {
  const [user, setUser] = useState<SessionPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/session")
        if (res.ok) {
          const data = await res.json()
          setUser(data)
        } else {
          setUser(null)
        }
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    fetchSession()
  }, [])

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/session")
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  return { user, loading, refresh }
}
