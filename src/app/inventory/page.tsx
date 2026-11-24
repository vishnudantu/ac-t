"use client"

import { useState } from "react"
import { Archive, ArrowLeft, Boxes, CheckCircle2, Package, Ticket, XCircle, Pencil } from "lucide-react"
import { MainLayout } from "@/components/layout/main-layout"
import { useSession } from "@/hooks/use-session"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getInventory } from "@/components/operations/api"
import { DataState, EmptyState, MetricSkeleton, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination, SearchInput } from "@/components/operations/list-controls"
import { MetricCard } from "@/components/operations/metric-card"
import { PageHeader } from "@/components/operations/page-header"
import { useOperationData } from "@/components/operations/use-operation-data"
import { formatCurrency, formatNumber } from "@/lib/utils"

const PAGE_SIZE = 25

export default function InventoryPage() {
  const [search, setSearch] = useState("")
  const [categoryId, setCategoryId] = useState("all")
  const [page, setPage] = useState(1)
  const { user } = useSession()
  const [editing, setEditing] = useState<(typeof inventory)[number] | null>(null)
  const [editTotal, setEditTotal] = useState("")
  const [editError, setEditError] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const canAdjust = Boolean(user?.permissions.includes("inventory:adjust"))

  async function saveInventory(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    const totalQuantity = Number(editTotal)
    if (!Number.isInteger(totalQuantity) || totalQuantity < 0) { setEditError("Enter a valid total quantity"); return }
    setEditSaving(true)
    setEditError("")
    try {
      const response = await fetch(`/api/inventory/${encodeURIComponent(editing.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ totalQuantity }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to adjust inventory")
      setEditing(null)
      retry()
    } catch (cause: unknown) { setEditError(cause instanceof Error ? cause.message : "Unable to adjust inventory") } finally { setEditSaving(false) }
  }
  const { data, loading, error, retry } = useOperationData(
    (signal) => getInventory(signal, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, categoryId }),
    [page, categoryId],
  )

  const inventory = data?.inventory ?? []
  const query = search.trim().toLowerCase()
  const filteredInventory = inventory.filter((item) =>
    !query || [item.ticketCategory.name, item.ticketCategory.displayName, item.standName,
      item.blockName, item.gateName, item.match.title, item.quotaPool?.displayName]
      .some((value) => value?.toLowerCase().includes(query)),
  )
  const categories = Array.from(new Map(inventory.map((item) => [
    item.ticketCategory.id,
    { value: item.ticketCategory.id, label: item.ticketCategory.displayName },
  ])).values()).sort((a, b) => a.label.localeCompare(b.label))
  const categoryOptions = [
    { value: "all", label: "All categories" },
    ...categories,
    ...(categoryId !== "all" && !categories.some((category) => category.value === categoryId)
      ? [{ value: categoryId, label: "Selected category" }]
      : []),
  ]

  function changeCategory(value: string) {
    setCategoryId(value)
    setPage(1)
  }

  function clearFilters() {
    setSearch("")
    setCategoryId("all")
    setPage(1)
  }

  const summary = data?.summary
  const metrics = summary ? [
    { label: "Total stock", value: summary.total, icon: Boxes, tone: "blue" as const },
    { label: "Available", value: summary.available, icon: CheckCircle2, tone: "green" as const },
    { label: "Allocated", value: summary.allocated, icon: Package, tone: "violet" as const },
    { label: "Reserved", value: summary.reserved, icon: Archive, tone: "amber" as const },
    { label: "Issued", value: summary.issued, icon: Ticket, tone: "default" as const },
    { label: "Returned", value: summary.returned, icon: ArrowLeft, tone: "default" as const },
    { label: "Void", value: summary.void, icon: XCircle, tone: "red" as const },
  ] : []

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader
          title="Ticket Inventory"
          description="Ticket stock and movement by match, category, and seating location."
          onRefresh={retry}
          refreshing={loading}
        />
        {loading && !summary ? <MetricSkeleton /> : error ? null : summary && (
          <section aria-labelledby="inventory-totals">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="inventory-totals" className="text-sm font-semibold">Stock totals</h2>
              <p className="text-xs text-muted-foreground">Current page · {inventory.length} pools{data && data.total > inventory.length ? ` of ${data.total}` : ""}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
              {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </div>
          </section>
        )}
        <Card className="shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={search}
              onChange={setSearch}
              label="Filter inventory on this page"
              placeholder="Filter this page by match, stand, or block…"
            />
            <FilterSelect value={categoryId} onChange={changeCategory} label="Category" options={categoryOptions} />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-lg">Inventory pools</CardTitle>
            <CardDescription>{data ? `${formatNumber(data.total)} inventory pools` : "Live inventory records"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={6} />}>
              {filteredInventory.length === 0 ? (
                <EmptyState
                  icon={<Boxes className="h-10 w-10" />}
                  title={query || categoryId !== "all" ? "No matching inventory" : "No inventory recorded"}
                  description={query
                    ? "No pools on this page match your search. Try another page or clear the search."
                    : categoryId !== "all"
                      ? "There are no pools in the selected category."
                      : "Inventory pools will appear here when stock is added."}
                  onClear={query || categoryId !== "all" ? clearFilters : undefined}
                />
              ) : (
                <Table>
                  <TableCaption className="sr-only">Inventory quantities by category and location</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Category &amp; match</TableHead>
                      <TableHead scope="col">Location</TableHead>
                      <TableHead scope="col">Format</TableHead>
                      <TableHead scope="col" className="text-right">Face value</TableHead>
                      <TableHead scope="col" className="text-right">Total</TableHead>
                      <TableHead scope="col" className="text-right">Available</TableHead>
                      <TableHead scope="col" className="text-right">Allocated</TableHead>
                      <TableHead scope="col" className="text-right">Reserved</TableHead>
                      <TableHead scope="col" className="text-right">Issued</TableHead>
                      <TableHead scope="col" className="text-right">Returned / void</TableHead>
                      {canAdjust && <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="min-w-52">
                          <Badge variant="secondary">{item.ticketCategory.displayName}</Badge>
                          <p className="mt-1.5 max-w-60 text-xs text-muted-foreground">{item.match.title}</p>
                          {item.quotaPool && <p className="mt-1 text-xs text-muted-foreground">Quota: {item.quotaPool.displayName}</p>}
                        </TableCell>
                        <TableCell className="min-w-40">
                          <div className="font-medium">{item.standName}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {[item.blockName && `Block ${item.blockName}`, item.gateName].filter(Boolean).join(" · ") || "Location details not specified"}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{item.ticketFormat}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{item.faceValue === null ? "—" : formatCurrency(item.faceValue)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatNumber(item.totalQuantity)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-green-700 dark:text-green-400">{formatNumber(item.availableQuantity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(item.allocatedQuantity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(item.reservedQuantity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(item.issuedQuantity)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(item.returnedQuantity)} / {formatNumber(item.voidQuantity)}</TableCell>
                        {canAdjust && <TableCell><Button variant="ghost" size="icon" aria-label={`Edit inventory ${item.standName}`} onClick={() => { setEditing(item); setEditTotal(String(item.totalQuantity)); setEditError("") }}><Pencil className="h-4 w-4" /></Button></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataState>
          </CardContent>
          {data && !error && !loading && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} itemCount={filteredInventory.length} onPageChange={setPage} filtered={Boolean(query)} />
          )}
        </Card>
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust inventory</DialogTitle><DialogDescription>{editing?.ticketCategory.displayName} · {editing?.standName}. Total stock cannot fall below allocated, issued, or void tickets.</DialogDescription></DialogHeader>
          <form onSubmit={saveInventory} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="inventory-total">Total quantity</Label><Input id="inventory-total" type="number" min={0} required value={editTotal} onChange={(event) => setEditTotal(event.target.value)} /></div>
            {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save quantity"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
