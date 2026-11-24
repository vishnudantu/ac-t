"use client"

import { useCallback, useEffect, useState } from "react"

interface OperationData<T> {
  data: T | null
  loading: boolean
  error: string | null
  retry: () => void
}

export function useOperationData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[] = [],
): OperationData<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setData(null)
    setError(null)

    fetcher(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        const message = cause instanceof Error ? cause.message : "Unable to load data. Please try again."
        setError(message)
        setData(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // The caller declares its fetcher's inputs; retry is an additional trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt])

  return { data, loading, error, retry }
}
