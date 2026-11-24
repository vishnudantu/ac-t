"use client"

import { useCallback, useEffect, useState } from "react"
import { getLifecycleList, type ListResponse } from "./client"

interface LifecycleData<T> {
  data: ListResponse<T> | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useLifecycleData<T>(
  resource: "approvals" | "distribution" | "matches" | "allocations",
  params: Record<string, string | number>,
  enabled: boolean,
): LifecycleData<T> {
  const [data, setData] = useState<ListResponse<T> | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const query = JSON.stringify(params)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const result = await getLifecycleList<T>(resource, new AbortController().signal, JSON.parse(query) as Record<string, string | number>)
      setData(result)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [enabled, query, resource])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    getLifecycleList<T>(resource, controller.signal, JSON.parse(query) as Record<string, string | number>)
      .then((result) => { if (!controller.signal.aborted) setData(result) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : "Unable to load data. Please try again.")
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [enabled, query, resource])

  return { data, loading, error, refresh }
}
