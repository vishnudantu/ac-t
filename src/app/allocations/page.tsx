"use client"

import { useState } from "react"
import { Package } from "lucide-react"
import { MainLayout } from "@/components/layout/main-layout"
import { useSession } from "@/hooks/use-session"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { postLifecycle } from "@/components/lifecycle/client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAllocations } from "@/components/operations/api"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination, SearchInput } from "@/components/operations/list-controls"
import { PageHeader } from "@/components/operations/page-header"
import { optionalNumber, optionalText } from "@/components/operations/types"
import { useOperationData } from "@/components/operations/use-operation-data"
import { formatDate, formatNumber, formatStatus, getStatusColor } from "@/lib/utils"

const PAGE_SIZE = 20

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "LOCKED", label: "Locked" },
  { value: "RELEASED", label: "Released" },
  { value: "CANCELLED", label: "Cancelled" },
]

export default function AllocationsPage() {
  const { user } = useSession()
  const [cancelling, setCancelling] = useState<{ id: string; requester: string; requestNumber: string } | null>(null)
  const [reason, setReason] = useState("")
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(1)
  const { data, loading, error, retry } = useOperationData(
    (signal) => getAllocations(signal, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, status }),
    [page, status],
  )

  const allocations = data?.allocations ?? []
  const query = search.trim().toLowerCase()
  const filteredAllocations = allocations.filter((allocation) =>
    !query || [allocation.allocationNumber, allocation.request.requestNumber,
      allocation.request.requester.fullName, allocation.match.title, allocation.officer.fullName]
      .some((value) => value.toLowerCase().includes(query)),
  )

  async function cancelAllocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cancelling || !reason.trim() || cancelPending) return
    setCancelPending(true)
    setCancelError(null)
    try {
      await postLifecycle(`/api/allocations/${encodeURIComponent(cancelling.id)}/cancel`, { reason: reason.trim() })
      setCancelling(null)
      retry()
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : "Unable to cancel allocation")
    } finally {
      setCancelPending(false)
    }
  }

  function changeStatus(value: string) {
    setStatus(value)
    setPage(1)
  }

  function clearFilters() {
    setSearch("")
    setStatus("all")
    setPage(1)
  }

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader
          title="Allocations"
          description="Approved ticket requests and their assigned inventory pools."
          onRefresh={retry}
          refreshing={loading}
        />
        <Card className="shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={search}
              onChange={setSearch}
              label="Filter allocations on this page"
              placeholder="Filter this page by allocation, request, or requester…"
            />
            <FilterSelect value={status} onChange={changeStatus} label="Status" options={statusOptions} />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-lg">Allocation records</CardTitle>
            <CardDescription>{data ? `${formatNumber(data.total)} allocation${data.total === 1 ? "" : "s"}` : "Live allocation records"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={5} />}>
              {filteredAllocations.length === 0 ? (
                <EmptyState
                  icon={<Package className="h-10 w-10" />}
                  title={query || status !== "all" ? "No matching allocations" : "No allocations recorded"}
                  description={query
                    ? "No allocations on this page match your search. Try another page or clear the search."
                    : status !== "all"
                      ? "There are no allocations with this status."
                      : "Allocation records will appear here after tickets are assigned."}
                  onClear={query || status !== "all" ? clearFilters : undefined}
                />
              ) : (
                <div className="divide-y">
                  {filteredAllocations.map((allocation) => {
                    const approved = allocation.items.reduce((sum, item) => sum + (optionalNumber(item.requestItem.approvedQuantity) ?? 0), 0)
                    const allocated = allocation.items.reduce((sum, item) => sum + (optionalNumber(item.quantity) ?? 0), 0)
                    const total = optionalNumber(allocation.totalQuantity) ?? allocated
                    return (
                      <article key={allocation.id} className="p-4" aria-labelledby={`allocation-${allocation.id}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 id={`allocation-${allocation.id}`} className="text-lg font-semibold">{allocation.request.requester.fullName}</h3>
                              <Badge className={getStatusColor(optionalText(allocation.status) ?? "PENDING")}>{formatStatus(optionalText(allocation.status) ?? "PENDING")}</Badge>
                            </div>
                            <p className="mt-1.5 text-sm">{allocation.request.requestNumber}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{allocation.match.title} · Officer: {allocation.officer.fullName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Created {formatDate(allocation.createdAt)}</p>
                          </div>
                          <dl className="flex shrink-0 gap-6 sm:text-right">
                            <div><dt className="text-xs text-muted-foreground">Approved</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatNumber(approved)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Allocated</dt><dd className="mt-1 text-lg font-bold tabular-nums text-green-700 dark:text-green-400">{formatNumber(total)}</dd></div>
                          </dl>
                        </div>
                        {user?.permissions.includes("allocations:confirm") && allocation.status === "CONFIRMED"
                          && allocation.allocationNumber.startsWith("AUTO-") && allocation.request.totalIssued === 0 && (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => {
                              setReason("")
                              setCancelError(null)
                              setCancelling({ id: allocation.id, requester: allocation.request.requester.fullName, requestNumber: allocation.request.requestNumber })
                            }}>Cancel allocation</Button>
                          )}
                        {allocation.items.length === 0 ? (
                          <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">No inventory items are linked to this allocation.</p>
                        ) : (
                          <div className="mt-3 overflow-hidden rounded-md border">
                            <Table>
                              <TableCaption className="sr-only">Items allocated to {allocation.request.requestNumber}</TableCaption>
                              <TableHeader>
                                <TableRow>
                                  <TableHead scope="col">Category</TableHead>
                                  <TableHead scope="col">Inventory location</TableHead>
                                  <TableHead scope="col">Item status</TableHead>
                                  <TableHead scope="col" className="text-right">Approved</TableHead>
                                  <TableHead scope="col" className="text-right">Allocated</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {allocation.items.map((item) => (
                                  <TableRow key={item.id}>
                                    <TableCell><Badge variant="secondary">{item.ticketCategory.displayName}</Badge></TableCell>
                                    <TableCell>
                                      <span className="text-sm">{item.inventoryPool.standName}</span>
                                      <span className="ml-1 text-xs text-muted-foreground">{item.inventoryPool.blockName ? `Block ${item.inventoryPool.blockName}` : "Block not specified"}</span>
                                    </TableCell>
                                    <TableCell><Badge variant="outline">{formatStatus(item.status)}</Badge></TableCell>
                                    <TableCell className="text-right tabular-nums">{formatNumber(optionalNumber(item.requestItem.approvedQuantity) ?? 0)}</TableCell>
                                    <TableCell className="text-right font-medium tabular-nums">{formatNumber(optionalNumber(item.quantity) ?? 0)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </DataState>
          </CardContent>
          {data && !error && !loading && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} itemCount={filteredAllocations.length} onPageChange={setPage} filtered={Boolean(query)} />
          )}
        </Card>
      </div>
      <Dialog open={Boolean(cancelling)} onOpenChange={(open) => { if (!open && !cancelPending) setCancelling(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel allocation</DialogTitle>
            <DialogDescription>Cancel the allocation for {cancelling?.requester} ({cancelling?.requestNumber}) and release its tickets and quota. This also cancels the request.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={cancelAllocation}>
            <div className="space-y-2">
              <Label htmlFor="allocation-cancel-reason">Reason</Label>
              <Textarea id="allocation-cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={2000} disabled={cancelPending} />
            </div>
            {cancelError && <p role="alert" className="text-sm text-destructive">{cancelError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={cancelPending} onClick={() => setCancelling(null)}>Keep allocation</Button>
              <Button type="submit" variant="destructive" disabled={cancelPending || !reason.trim()}>Cancel allocation</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
