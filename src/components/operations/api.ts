import { z } from "zod"
import {
  allocationsResponseSchema,
  inventoryResponseSchema,
  matchesResponseSchema,
  quotasResponseSchema,
  requestsResponseSchema,
  type AllocationsResponse,
  type InventoryResponse,
  type MatchesResponse,
  type QuotasResponse,
  type RequestsResponse,
} from "./types"

interface Query {
  limit?: number
  offset?: number
  status?: string
  categoryId?: string
}

function makeUrl(path: string, query: Query = {}): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "all" && value !== "") {
      params.set(key, String(value))
    }
  })
  const queryString = params.toString()
  return `${path}${queryString ? `?${queryString}` : ""}`
}

async function fetchData<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  query?: Query,
): Promise<T> {
  const response = await fetch(makeUrl(path, query), {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message = typeof body === "object" && body !== null && "error" in body
      && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${response.status}.`
    throw new Error(message)
  }

  const payload: unknown = await response.json()
  return schema.parse(payload)
}

export function getMatches(signal: AbortSignal, query?: Query): Promise<MatchesResponse> {
  return fetchData("/api/matches", matchesResponseSchema, signal, query)
}

export function getRequests(signal: AbortSignal, query?: Query): Promise<RequestsResponse> {
  return fetchData("/api/requests", requestsResponseSchema, signal, query)
}

export function getInventory(signal: AbortSignal, query?: Query): Promise<InventoryResponse> {
  return fetchData("/api/inventory", inventoryResponseSchema, signal, query)
}

export function getQuotas(signal: AbortSignal, query?: Query): Promise<QuotasResponse> {
  return fetchData("/api/quotas", quotasResponseSchema, signal, query)
}

export function getAllocations(signal: AbortSignal, query?: Query): Promise<AllocationsResponse> {
  return fetchData("/api/allocations", allocationsResponseSchema, signal, query)
}
