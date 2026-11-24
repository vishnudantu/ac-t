"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getAllLifecycleList, getRequestItems } from "./client"
import { getIssuedQuantity, getRequestItemIssued } from "./rules"
import type { AllocationRecord, DistributionBatch, IssuanceGroup, MatchOption, RequestItemsByRequest } from "./types"

interface IssuanceOptions {
  allocations: AllocationRecord[]
  drafts: AllocationRecord[]
  groups: IssuanceGroup[]
  batches: DistributionBatch[]
  matches: MatchOption[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useIssuanceOptions(open: boolean, needsBatches: boolean, canReadRequests: boolean, canReadAllocations: boolean): IssuanceOptions {
  const [allocations, setAllocations] = useState<AllocationRecord[]>([])
  const [requestItems, setRequestItems] = useState<RequestItemsByRequest>({})
  const [issuances, setIssuances] = useState<DistributionBatch["issuances"]>([])
  const [allBatches, setAllBatches] = useState<DistributionBatch[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadOptions = useCallback(async (signal?: AbortSignal) => {
    if (!open && !needsBatches) return
    setLoading(true)
    setLoaded(false)
    setError(null)
    const abortSignal = signal ?? new AbortController().signal
    try {
      const batchItems = await getAllLifecycleList<DistributionBatch>("distribution", abortSignal, { status: "all" })
      setAllBatches(batchItems)
      setIssuances(batchItems.flatMap((batch) => batch.issuances))
      if (!open) { setLoaded(true); return }
      const allocationItems = canReadAllocations ? await getAllLifecycleList<AllocationRecord>("allocations", abortSignal, { status: "all" }) : []
      if (abortSignal.aborted) return
      const available = allocationItems.filter((allocation) => ["DRAFT", "CONFIRMED"].includes(allocation.status))
      const uniqueRequestIds = [...new Set(available.map((allocation) => allocation.request.id))]
      const itemGroups = canReadRequests ? await Promise.all(uniqueRequestIds.map(async (requestId) => [requestId, await getRequestItems(requestId, abortSignal)] as const)) : []
      if (abortSignal.aborted) return
      setAllocations(available)
      setRequestItems(Object.fromEntries(itemGroups))
      setLoaded(true)
    } catch (cause: unknown) {
      if (abortSignal.aborted) return
      setAllocations([])
      setRequestItems({})
      setIssuances([])
      setAllBatches([])
      setError(cause instanceof Error ? cause.message : "Unable to load allocations.")
    } finally {
      if (!abortSignal.aborted) setLoading(false)
    }
  }, [canReadAllocations, canReadRequests, needsBatches, open])

  useEffect(() => {
    if (!open && !needsBatches) return
    const controller = new AbortController()
    void loadOptions(controller.signal)
    return () => controller.abort()
  }, [loadOptions, needsBatches, open])

  const groups = useMemo(() => {
    return allocations.filter((allocation) => allocation.status === "CONFIRMED").flatMap((allocation) => {
      const byCategory = new Map<string, string[]>()
      const allocationRequestItems = requestItems[allocation.request.id] ?? []
      allocationRequestItems.forEach((item) => byCategory.set(item.ticketCategoryId, [...(byCategory.get(item.ticketCategoryId) ?? []), item.id]))
      return allocation.items.flatMap((item) => {
        if (!["CONFIRMED", "ISSUED"].includes(item.status)) return []
        const categoryMatches = byCategory.get(item.ticketCategoryId ?? "") ?? []
        if (categoryMatches.length !== 1) return []
        const requestItemId = categoryMatches[0]
        const requestItem = allocationRequestItems.find((candidate) => candidate.id === requestItemId)
        if (!requestItem) return []
        const allocatedIssued = getIssuedQuantity(issuances, item.id)
        const requestIssued = getRequestItemIssued(issuances, requestItem.id)
        const otherAllocations = allocations.filter((candidate) => candidate.request.id === allocation.request.id && candidate.id !== allocation.id).flatMap((candidate) => candidate.items.filter((candidateItem) => candidateItem.ticketCategoryId === item.ticketCategoryId))
        const otherIssued = otherAllocations.reduce((sum, candidateItem) => sum + getIssuedQuantity(issuances, candidateItem.id), 0)
        const remaining = Math.max(0, Math.min(item.quantity - allocatedIssued, requestItem.approvedQuantity - requestIssued, requestItem.allocatedQuantity - requestIssued - otherIssued))
        return [{ allocation, item, requestItemId, remaining }]
      })
    })
  }, [allocations, issuances, requestItems])

  async function refresh() { await loadOptions() }
  const batches = allBatches
  const matches = [...new Map([
    ...batches.map((batch) => [batch.match.id, { id: batch.match.id, title: batch.match.title, matchDate: batch.match.matchDate }] as const),
    ...allocations.map((allocation) => [allocation.match.id, { id: allocation.match.id, title: allocation.match.title, matchDate: "" }] as const),
  ]).values()]
  return { allocations, drafts: allocations.filter((allocation) => allocation.status === "DRAFT"), groups: loaded ? groups : [], batches, matches, loading, error, refresh }
}
