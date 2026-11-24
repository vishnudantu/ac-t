"use client"

import type {
  AllocationRecord,
  ApprovalStepRecord,
  DistributionBatch,
  MatchOption,
} from "./types"

export interface ListResponse<T> {
  items: T[]
  total: number
}

interface ListPayload {
  success: boolean
  total: number
  steps?: ApprovalStepRecord[]
  batches?: DistributionBatch[]
  matches?: MatchOption[]
  allocations?: AllocationRecord[]
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error
  }
  return fallback
}

async function readPayload(response: Response, fallback: string): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(payload, fallback))
  if (typeof payload === "object" && payload !== null && "success" in payload && payload.success === false) {
    throw new Error(errorMessage(payload, fallback))
  }
  return payload
}

export async function getLifecycleList<T>(
  resource: "approvals" | "distribution" | "matches" | "allocations",
  signal: AbortSignal,
  params: Record<string, string | number>,
): Promise<ListResponse<T>> {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => search.set(key, String(value)))
  const response = await fetch(`/api/${resource}?${search.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  })
  const payload = await readPayload(response, `Unable to load ${resource}.`) as ListPayload
  const key = resource === "approvals" ? "steps" : resource === "distribution" ? "batches" : resource
  return { items: (payload[key] ?? []) as T[], total: payload.total }
}

export async function getAllLifecycleList<T>(
  resource: "approvals" | "distribution" | "matches" | "allocations",
  signal: AbortSignal,
  params: Record<string, string | number> = {},
): Promise<T[]> {
  const first = await getLifecycleList<T>(resource, signal, { ...params, limit: 100, offset: 0 })
  const items = [...first.items]
  while (items.length < first.total) {
    if (signal.aborted) throw new DOMException("The request was aborted.", "AbortError")
    const next = await getLifecycleList<T>(resource, signal, { ...params, limit: 100, offset: items.length })
    if (next.items.length === 0) throw new Error(`Unable to load the complete ${resource} list. Refresh and try again.`)
    items.push(...next.items)
  }
  return items
}

export async function getRequestItems(requestId: string, signal: AbortSignal): Promise<Array<{ id: string; ticketCategoryId: string; requestedQuantity: number; approvedQuantity: number; allocatedQuantity: number; issuedQuantity: number }>> {
  const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}`, { cache: "no-store", signal, headers: { Accept: "application/json" } })
  const payload = await readPayload(response, "Unable to load request items.") as {
    request?: { items?: Array<{ id: string; ticketCategoryId: string; requestedQuantity: number; approvedQuantity: number; allocatedQuantity: number; issuedQuantity: number }> }
  }
  return payload.request?.items ?? []
}

export async function postLifecycle<TPayload extends object, TResult>(
  path: string,
  payload: TPayload,
): Promise<TResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  })
  return await readPayload(response, "The operation could not be completed.") as TResult
}

export const selectClassName = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
