"use client"

import * as React from "react"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { AlertCircle, Download, Eye, FileText, Plus, Search, Upload } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatStatus, getPriorityColor, getStatusColor } from "@/lib/utils"

type RequestRecord = Prisma.RequestGetPayload<{
  include: {
    match: { select: { id: true; title: true; matchDate: true } }
    requester: {
      select: {
        id: true
        fullName: true
        mobileNumber: true
        email: true
        organisation: { select: { name: true } }
      }
    }
    createdBy: { select: { id: true; fullName: true } }
    assignedTo: { select: { id: true; fullName: true } }
    items: { include: { ticketCategory: { select: { id: true; name: true; displayName: true } } } }
    _count: { select: { attachments: true; comments: true; approvalSteps: true } }
  }
}>

interface RequestsResponse {
  requests: RequestRecord[]
  total: number
}

const PAGE_SIZE = 25
const selectClassName = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

export default function RequestsPage() {
  const { user, loading: sessionLoading } = useSession()
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [priorityFilter, setPriorityFilter] = React.useState("all")
  const [offset, setOffset] = React.useState(0)
  const [response, setResponse] = React.useState<RequestsResponse>({ requests: [], total: 0 })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [reloadKey, setReloadKey] = React.useState(0)

  const canRead = Boolean(user?.permissions.includes("requests:read"))
  const canWrite = Boolean(user?.permissions.includes("requests:write"))
  const canImport = Boolean(user?.permissions.includes("requests:bulk_import"))
  const canExport = Boolean(user?.permissions.includes("requests:export"))

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setOffset(0)
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  React.useEffect(() => {
    if (sessionLoading || !canRead) {
      if (!sessionLoading) setLoading(false)
      return
    }

    const controller = new AbortController()
    const loadRequests = async () => {
      setLoading(true)
      setError("")
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        status: statusFilter,
      })
      if (search) params.set("search", search)
      try {
        const result = await fetch(`/api/requests?${params.toString()}`, { signal: controller.signal })
        const body: unknown = await result.json()
        if (!result.ok) throw new Error(getApiError(body, "Unable to load requests"))
        const data = body as RequestsResponse
        setResponse({ requests: Array.isArray(data.requests) ? data.requests : [], total: Number(data.total) || 0 })
      } catch (requestError: unknown) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return
        setError(getErrorMessage(requestError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadRequests()
    return () => controller.abort()
  }, [canRead, offset, reloadKey, search, sessionLoading, statusFilter])

  const filteredRequests = React.useMemo(
    () => response.requests.filter((request) => priorityFilter === "all" || request.priority === priorityFilter),
    [priorityFilter, response.requests],
  )

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearch(searchInput.trim())
    setOffset(0)
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
            <p className="text-muted-foreground">Track ticket requests from receipt through fulfilment</p>
          </div>
          {(canImport || canExport || canWrite) && (
            <div className="flex flex-wrap gap-2">
              {canImport && (
                <Button variant="outline" asChild>
                  <Link href="/admin/import-export"><Upload className="mr-2 h-4 w-4" />Import</Link>
                </Button>
              )}
              {canExport && (
                <Button variant="outline" asChild>
                  <Link href="/admin/import-export"><Download className="mr-2 h-4 w-4" />Export</Link>
                </Button>
              )}
              {canWrite && (
                <Button asChild><Link href="/requests/new"><Plus className="mr-2 h-4 w-4" />New request</Link></Button>
              )}
            </div>
          )}
        </div>

        {!sessionLoading && !canRead ? (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Access unavailable</AlertTitle><AlertDescription>Your account does not have permission to view requests.</AlertDescription></Alert>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <form className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_190px_170px_auto]" onSubmit={submitSearch}>
                  <div className="space-y-2">
                    <Label htmlFor="request-search">Search requests</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input id="request-search" className="pl-10" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Request number, requester, phone or email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="request-status">Status</Label>
                    <select id="request-status" className={selectClassName} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setOffset(0) }}>
                      <option value="all">All statuses</option>
                      {['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'CLOSED'].map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="request-priority">Priority on this page</Label>
                    <select id="request-priority" className={selectClassName} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                      <option value="all">All priorities</option>
                      {['LOW', 'NORMAL', 'HIGH', 'PROTOCOL'].map((priority) => <option key={priority} value={priority}>{formatStatus(priority)}</option>)}
                    </select>
                  </div>
                  <Button type="submit" variant="secondary" className="self-end">Search</Button>
                </form>
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" /><AlertTitle>Could not load requests</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Try again</Button></AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader><CardTitle>Request directory ({response.total})</CardTitle></CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-48 items-center justify-center" role="status"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /><span className="sr-only">Loading requests</span></div>
                ) : !error && filteredRequests.length === 0 ? (
                  <div className="py-12 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <h2 className="mt-4 text-lg font-medium">No requests found</h2>
                    <p className="mt-2 text-muted-foreground">{response.total > 0 ? "No requests on this page match the selected priority." : "Try another search or status filter."}</p>
                    {canWrite && response.total === 0 && <Button className="mt-4" asChild><Link href="/requests/new">Create a request</Link></Button>}
                  </div>
                ) : !error ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Requester</TableHead><TableHead>Match</TableHead><TableHead>Categories</TableHead><TableHead className="text-right">Requested / approved</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Created</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                      <TableBody>
                        {filteredRequests.map((request) => (
                          <TableRow key={request.id}>
                            <TableCell><Link className="font-mono font-medium text-primary hover:underline" href={`/requests/${request.id}`}>{request.requestNumber}</Link><p className="mt-1 text-xs text-muted-foreground">{formatStatus(request.source)}</p></TableCell>
                            <TableCell><p className="font-medium">{request.requester.fullName}</p><p className="max-w-[180px] truncate text-sm text-muted-foreground">{request.requester.organisation?.name || "No organisation"}</p></TableCell>
                            <TableCell><p className="max-w-[220px] truncate" title={request.match.title}>{request.match.title}</p><p className="text-sm text-muted-foreground">{formatDate(request.match.matchDate)}</p></TableCell>
                            <TableCell><div className="flex max-w-[260px] flex-wrap gap-1">{request.items.map((item) => <Badge key={item.id} variant="secondary" className="text-xs">{item.ticketCategory.displayName} ({item.requestedQuantity})</Badge>)}</div></TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium">{request.totalRequested} / <span className="text-green-700">{request.totalApproved}</span></TableCell>
                            <TableCell><Badge className={getStatusColor(request.status)}>{formatStatus(request.status)}</Badge></TableCell>
                            <TableCell><Badge className={getPriorityColor(request.priority)}>{formatStatus(request.priority)}</Badge></TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(request.createdAt)}<p>{request.assignedTo?.fullName || "Unassigned"}</p></TableCell>
                            <TableCell><Button variant="ghost" size="sm" asChild><Link href={`/requests/${request.id}`} aria-label={`View ${request.requestNumber}`}><Eye className="mr-2 h-4 w-4" />View</Link></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>{response.total === 0 ? "0 requests" : `Showing ${offset + 1}–${Math.min(offset + response.requests.length, response.total)} of ${response.total}`}</p>
              <div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>Previous</Button><Button variant="outline" size="sm" disabled={offset + response.requests.length >= response.total || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}>Next</Button></div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  )
}

function getApiError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error
  return fallback
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load requests"
}
