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
  matchId?: string
  type?: string
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

const importJobSchema = z.object({
  id: z.string(), jobNumber: z.string(), importType: z.string(), fileName: z.string(), fileSize: z.number(), status: z.string(),
  totalRows: z.number(), validRows: z.number(), invalidRows: z.number(), duplicateRows: z.number(), importedRows: z.number(),
  errorSummary: z.string().nullable(), createdAt: z.string(), completedAt: z.string().nullable(),
  match: z.object({ title: z.string() }).nullable(), creator: z.object({ fullName: z.string(), email: z.string() }).nullable(),
}).passthrough()
const exportJobSchema = z.object({
  id: z.string(), jobNumber: z.string(), exportType: z.string(), format: z.string(), fileName: z.string().nullable(),
  fileSize: z.number().nullable(), status: z.string(), recordCount: z.number(), createdAt: z.string(), updatedAt: z.string(),
  match: z.object({ title: z.string() }).nullable(), creator: z.object({ fullName: z.string(), email: z.string() }).nullable(),
}).passthrough()
const importRowSchema = z.object({
  id: z.string(), rowNumber: z.number(), rawData: z.string(), mappedData: z.string().nullable(), status: z.string(), errors: z.string().nullable(),
}).passthrough()
export type ImportJob = z.infer<typeof importJobSchema>
export type ExportJob = z.infer<typeof exportJobSchema>
export type ImportRow = z.infer<typeof importRowSchema>
export interface ImportDetail { job: ImportJob; rows: ImportRow[] }

export function getImports(signal: AbortSignal, query?: Query): Promise<{ jobs: ImportJob[]; total: number }> {
  return fetchData("/api/imports", z.object({ jobs: z.array(importJobSchema), total: z.number() }), signal, query)
}

export function getExports(signal: AbortSignal, query?: Query): Promise<{ jobs: ExportJob[]; total: number }> {
  return fetchData("/api/exports", z.object({ jobs: z.array(exportJobSchema), total: z.number() }), signal, query)
}

export function getImportDetail(id: string, signal: AbortSignal): Promise<ImportDetail> {
  return fetchData(`/api/imports/${encodeURIComponent(id)}`, z.object({ job: importJobSchema, rows: z.array(importRowSchema) }), signal)
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null)
  return new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : fallback)
}

export async function createImport(type: string, file: File): Promise<void> {
  const form = new FormData()
  form.set("type", type)
  form.set("file", file)
  const response = await fetch("/api/imports", { method: "POST", body: form })
  if (!response.ok) throw await apiError(response, "Unable to import the selected file")
}

export async function downloadExport(input: { type: string; format: "CSV" | "XLSX"; matchId?: string; filters?: Record<string, unknown> }): Promise<void> {
  const response = await fetch("/api/exports", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await apiError(response, "Unable to export data")
  const blob = await response.blob()
  const disposition = response.headers.get("Content-Disposition") || ""
  const fileName = /filename="([a-z0-9.-]+)"/i.exec(disposition)?.[1] || `aca-ticketops-export.${input.format.toLowerCase()}`
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
