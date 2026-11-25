"use client"

import { useState } from "react"
import { Archive, ArrowLeft, Boxes, CheckCircle2, Package, Plus, Ticket, Trash2, XCircle, Pencil } from "lucide-react"
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
import { selectClassName } from "@/components/lifecycle/client"
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
  const [editForm, setEditForm] = useState({ totalQuantity: "", standName: "", blockName: "", gateName: "", rowStart: "", rowEnd: "", seatStart: "", seatEnd: "", ticketFormat: "PHYSICAL", faceValue: "", notes: "" })
  const [editError, setEditError] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [deleting, setDeleting] = useState<(typeof inventory)[number] | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState("")
  const [createSaving, setCreateSaving] = useState(false)
  const [matches, setMatches] = useState<{ id: string; title: string }[]>([])
  const [categoryOptionsForCreate, setCategories] = useState<{ id: string; displayName: string; pricingTier: number }[]>([])
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryError, setCategoryError] = useState("")
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryForm, setCategoryForm] = useState({ displayName: "", pricingTier: "0", sortOrder: "0", colorCode: "#1e3a8a" })
  const [editingCategory, setEditingCategory] = useState<{ id: string; displayName: string; pricingTier: number } | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<{ id: string; displayName: string } | null>(null)
  const [createForm, setCreateForm] = useState({ matchId: "", ticketCategoryId: "", standName: "", blockName: "", gateName: "", ticketFormat: "PHYSICAL", faceValue: "", totalQuantity: "" })
  const canAdjust = Boolean(user?.permissions.includes("inventory:adjust"))
  const canWrite = Boolean(user?.permissions.includes("inventory:write"))
  const canDelete = Boolean(user?.roles?.includes("SUPER_ADMIN"))

  async function openCreate() {
    setCreateError("")
    setCreateForm({ matchId: "", ticketCategoryId: "", standName: "", blockName: "", gateName: "", ticketFormat: "PHYSICAL", faceValue: "", totalQuantity: "" })
    setCreateOpen(true)
    try {
      const response = await fetch("/api/matches?limit=100", { cache: "no-store" })
      const body = await response.json() as { matches?: { id: string; title: string }[] }
      setMatches(body.matches || [])
    } catch { setMatches([]) }
  }

  async function loadCategories(matchId: string) {
    setCreateForm((current) => ({ ...current, matchId, ticketCategoryId: "" }))
    setCategories([])
    if (!matchId) return
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/categories`, { cache: "no-store" })
      const body = await response.json() as { categories?: { id: string; displayName: string; pricingTier: number }[] }
      setCategories(body.categories || [])
    } catch { setCategories([]) }
  }

  function openCategories() {
    setCategoryError("")
    setCategoryForm({ displayName: "", pricingTier: "0", sortOrder: String(categoryOptionsForCreate.length), colorCode: "#1e3a8a" })
    if (matches.length === 0) {
      fetch("/api/matches?limit=100", { cache: "no-store" })
        .then((response) => response.json())
        .then((body: { matches?: { id: string; title: string }[] }) => setMatches(body.matches || []))
        .catch(() => setMatches([]))
    }
    setCategoryOpen(true)
  }

  async function selectCategoryMatch(matchId: string) {
    await loadCategories(matchId)
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault()
    if (!createForm.matchId) { setCategoryError("Select a match first"); return }
    setCategorySaving(true)
    setCategoryError("")
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(createForm.matchId)}/categories`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryForm.displayName, displayName: categoryForm.displayName,
          pricingTier: Number(categoryForm.pricingTier), sortOrder: Number(categoryForm.sortOrder),
          colorCode: categoryForm.colorCode,
        }),
      })
      const body = await response.json() as { error?: string; category?: { id: string; displayName: string } }
      if (!response.ok) throw new Error(body.error || "Unable to create ticket category")
      await loadCategories(createForm.matchId)
      if (body.category) setCreateForm((current) => ({ ...current, ticketCategoryId: body.category!.id }))
      setCategoryOpen(false)
    } catch (cause: unknown) {
      setCategoryError(cause instanceof Error ? cause.message : "Unable to create ticket category")
    } finally {
      setCategorySaving(false)
    }
  }

  function startCategoryEdit(category: { id: string; displayName: string; pricingTier: number }) {
    setEditingCategory(category)
    setCategoryForm({ displayName: category.displayName, pricingTier: String(category.pricingTier), sortOrder: "0", colorCode: "#1e3a8a" })
    setCategoryError("")
  }

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault()
    if (!editingCategory) return
    setCategorySaving(true)
    setCategoryError("")
    try {
      const response = await fetch(`/api/ticket-categories/${encodeURIComponent(editingCategory.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: categoryForm.displayName, pricingTier: Number(categoryForm.pricingTier) }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to update category")
      setEditingCategory(null)
      await loadCategories(createForm.matchId)
    } catch (cause: unknown) {
      setCategoryError(cause instanceof Error ? cause.message : "Unable to update category")
    } finally {
      setCategorySaving(false)
    }
  }

  async function deleteCategory() {
    if (!deletingCategory) return
    setCategorySaving(true)
    setCategoryError("")
    try {
      const response = await fetch(`/api/ticket-categories/${encodeURIComponent(deletingCategory.id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to delete category")
      setDeletingCategory(null)
      await loadCategories(createForm.matchId)
    } catch (cause: unknown) {
      setCategoryError(cause instanceof Error ? cause.message : "Unable to delete category")
    } finally {
      setCategorySaving(false)
    }
  }

  async function createInventory(event: React.FormEvent) {
    event.preventDefault()
    setCreateSaving(true)
    setCreateError("")
    try {
      const response = await fetch("/api/inventory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: createForm.matchId, ticketCategoryId: createForm.ticketCategoryId,
          standName: createForm.standName, blockName: createForm.blockName || null,
          gateName: createForm.gateName || null, ticketFormat: createForm.ticketFormat,
          faceValue: createForm.faceValue || null, totalQuantity: Number(createForm.totalQuantity),
        }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to create inventory pool")
      setCreateOpen(false)
      retry()
    } catch (cause: unknown) { setCreateError(cause instanceof Error ? cause.message : "Unable to create inventory pool") } finally { setCreateSaving(false) }
  }

  async function deleteInventory() {
    if (!deleting) return
    setDeleteSaving(true)
    setDeleteError("")
    try {
      const response = await fetch(`/api/inventory/${encodeURIComponent(deleting.id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to delete inventory")
      setDeleting(null)
      retry()
    } catch (cause: unknown) { setDeleteError(cause instanceof Error ? cause.message : "Unable to delete inventory") } finally { setDeleteSaving(false) }
  }

  function openEdit(item: (typeof inventory)[number]) {
    setEditing(item)
    setEditForm({
      totalQuantity: String(item.totalQuantity),
      standName: item.standName, blockName: item.blockName || "", gateName: item.gateName || "",
      rowStart: "", rowEnd: "", seatStart: "", seatEnd: "",
      ticketFormat: item.ticketFormat, faceValue: item.faceValue === null ? "" : String(item.faceValue), notes: "",
    })
    setEditError("")
  }

  async function saveInventory(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    const totalQuantity = Number(editForm.totalQuantity)
    if (!Number.isInteger(totalQuantity) || totalQuantity < 0) { setEditError("Enter a valid total quantity"); return }
    setEditSaving(true)
    setEditError("")
    try {
      const response = await fetch(`/api/inventory/${encodeURIComponent(editing.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalQuantity,
          standName: editForm.standName,
          blockName: editForm.blockName || null,
          gateName: editForm.gateName || null,
          rowStart: editForm.rowStart || null,
          rowEnd: editForm.rowEnd || null,
          seatStart: editForm.seatStart === "" ? null : Number(editForm.seatStart),
          seatEnd: editForm.seatEnd === "" ? null : Number(editForm.seatEnd),
          ticketFormat: editForm.ticketFormat,
          faceValue: editForm.faceValue || null,
          notes: editForm.notes || null,
        }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to update inventory")
      setEditing(null)
      retry()
    } catch (cause: unknown) { setEditError(cause instanceof Error ? cause.message : "Unable to update inventory") } finally { setEditSaving(false) }
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
          actions={canWrite ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={openCategories}>Ticket categories</Button><Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New pool</Button></div> : undefined}
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
                        {canAdjust && <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Edit inventory ${item.standName}`} onClick={() => { openEdit(item) }}><Pencil className="h-4 w-4" /></Button>{canDelete && <Button variant="ghost" size="icon" aria-label={`Delete inventory ${item.standName}`} onClick={() => { setDeleteError(""); setDeleting(item) }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div></TableCell>}
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
          <DialogHeader><DialogTitle>Edit inventory pool</DialogTitle><DialogDescription>{editing?.ticketCategory.displayName} · {editing?.standName}. Total stock cannot fall below allocated, issued, or void tickets.</DialogDescription></DialogHeader>
          <form onSubmit={saveInventory} className="space-y-4">
            {editError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{editError}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-stand">Stand name</Label><Input id="edit-stand" required maxLength={250} value={editForm.standName} onChange={(event) => setEditForm({ ...editForm, standName: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-block">Block</Label><Input id="edit-block" maxLength={100} value={editForm.blockName} onChange={(event) => setEditForm({ ...editForm, blockName: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-gate">Gate</Label><Input id="edit-gate" maxLength={100} value={editForm.gateName} onChange={(event) => setEditForm({ ...editForm, gateName: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-row-start">Row start</Label><Input id="edit-row-start" maxLength={50} value={editForm.rowStart} onChange={(event) => setEditForm({ ...editForm, rowStart: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-row-end">Row end</Label><Input id="edit-row-end" maxLength={50} value={editForm.rowEnd} onChange={(event) => setEditForm({ ...editForm, rowEnd: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-seat-start">Seat start</Label><Input id="edit-seat-start" type="number" min={1} value={editForm.seatStart} onChange={(event) => setEditForm({ ...editForm, seatStart: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-seat-end">Seat end</Label><Input id="edit-seat-end" type="number" min={1} value={editForm.seatEnd} onChange={(event) => setEditForm({ ...editForm, seatEnd: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-format">Ticket format</Label><select id="edit-format" className={selectClassName} value={editForm.ticketFormat} onChange={(event) => setEditForm({ ...editForm, ticketFormat: event.target.value })} disabled={editSaving}><option value="PHYSICAL">Physical</option><option value="DIGITAL">Digital</option><option value="BOTH">Both</option></select></div>
              <div className="space-y-2"><Label htmlFor="edit-value">Face value (₹)</Label><Input id="edit-value" inputMode="decimal" value={editForm.faceValue} onChange={(event) => setEditForm({ ...editForm, faceValue: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2"><Label htmlFor="edit-total">Total quantity</Label><Input id="edit-total" type="number" min={0} required value={editForm.totalQuantity} onChange={(event) => setEditForm({ ...editForm, totalQuantity: event.target.value })} disabled={editSaving} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-notes">Notes</Label><Input id="edit-notes" maxLength={2000} value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} disabled={editSaving} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={editSaving}>Cancel</Button><Button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={(open) => { if (!createSaving) setCreateOpen(open) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New inventory pool</DialogTitle><DialogDescription>Add ticket stock for a match category and seating location.</DialogDescription></DialogHeader>
          <form onSubmit={createInventory} className="space-y-4">
            {createError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{createError}</p>}
            <div className="space-y-2"><Label htmlFor="pool-match">Match</Label><select id="pool-match" className={selectClassName} required value={createForm.matchId} onChange={(event) => loadCategories(event.target.value)}><option value="">Select match</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="pool-category">Ticket category</Label><select id="pool-category" className={selectClassName} required disabled={!createForm.matchId} value={createForm.ticketCategoryId} onChange={(event) => setCreateForm({ ...createForm, ticketCategoryId: event.target.value })}><option value="">{createForm.matchId ? "Select category" : "Select a match first"}</option>{categoryOptionsForCreate.map((category) => <option key={category.id} value={category.id}>{category.displayName}</option>)}</select></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="pool-stand">Stand name</Label><Input id="pool-stand" required maxLength={250} value={createForm.standName} onChange={(event) => setCreateForm({ ...createForm, standName: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="pool-block">Block</Label><Input id="pool-block" maxLength={100} value={createForm.blockName} onChange={(event) => setCreateForm({ ...createForm, blockName: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="pool-gate">Gate</Label><Input id="pool-gate" maxLength={100} value={createForm.gateName} onChange={(event) => setCreateForm({ ...createForm, gateName: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="pool-format">Ticket format</Label><select id="pool-format" className={selectClassName} value={createForm.ticketFormat} onChange={(event) => setCreateForm({ ...createForm, ticketFormat: event.target.value })}><option value="PHYSICAL">Physical</option><option value="DIGITAL">Digital</option><option value="BOTH">Both</option></select></div>
              <div className="space-y-2"><Label htmlFor="pool-value">Face value (₹)</Label><Input id="pool-value" inputMode="decimal" value={createForm.faceValue} onChange={(event) => setCreateForm({ ...createForm, faceValue: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="pool-total">Total quantity</Label><Input id="pool-total" type="number" min={1} required value={createForm.totalQuantity} onChange={(event) => setCreateForm({ ...createForm, totalQuantity: event.target.value })} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>Cancel</Button><Button type="submit" disabled={createSaving}>{createSaving ? "Creating…" : "Create pool"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={categoryOpen} onOpenChange={(open) => { if (!categorySaving) setCategoryOpen(open) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Ticket categories</DialogTitle><DialogDescription>Add ticket categories for a match. They are then available when creating inventory pools and requests.</DialogDescription></DialogHeader>
          {categoryError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{categoryError}</p>}
          <div className="space-y-2"><Label htmlFor="category-match">Match</Label><select id="category-match" className={selectClassName} value={createForm.matchId} onChange={(event) => selectCategoryMatch(event.target.value)}><option value="">Select match</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</select></div>
          <div className="max-h-48 overflow-y-auto rounded-md border">
            {categoryOptionsForCreate.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{createForm.matchId ? "No categories yet. Add the first one below." : "Select a match to see its categories."}</p> : <ul className="divide-y">{categoryOptionsForCreate.map((category) => <li key={category.id} className="flex items-center justify-between gap-2 p-3 text-sm"><span className="font-medium">{category.displayName}</span><span className="flex gap-1">{canWrite && <Button type="button" variant="ghost" size="icon" aria-label={`Edit category ${category.displayName}`} onClick={() => startCategoryEdit(category)}><Pencil className="h-4 w-4" /></Button>}{canDelete && <Button type="button" variant="ghost" size="icon" aria-label={`Delete category ${category.displayName}`} onClick={() => { setCategoryError(""); setDeletingCategory(category) }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</span></li>)}</ul>}
          </div>
          <form onSubmit={createCategory} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">{editingCategory ? `Edit ${editingCategory.displayName}` : "Add category"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="category-name">Display name</Label><Input id="category-name" required minLength={2} maxLength={100} placeholder="e.g. Premium" value={categoryForm.displayName} onChange={(event) => setCategoryForm({ ...categoryForm, displayName: event.target.value })} disabled={categorySaving} /></div>
              <div className="space-y-2"><Label htmlFor="category-tier">Pricing tier</Label><Input id="category-tier" type="number" min={0} max={10} value={categoryForm.pricingTier} onChange={(event) => setCategoryForm({ ...categoryForm, pricingTier: event.target.value })} disabled={categorySaving} /></div>
              <div className="space-y-2"><Label htmlFor="category-order">Sort order</Label><Input id="category-order" type="number" min={0} value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })} disabled={categorySaving} /></div>
              <div className="space-y-2"><Label htmlFor="category-colour">Colour</Label><Input id="category-colour" type="color" className="h-10 p-1" value={categoryForm.colorCode} onChange={(event) => setCategoryForm({ ...categoryForm, colorCode: event.target.value })} disabled={categorySaving} /></div>
            </div>
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={categorySaving || (!editingCategory && !createForm.matchId)}>{categorySaving ? "Saving..." : editingCategory ? "Save changes" : "Add category"}</Button>{editingCategory && <Button type="button" size="sm" variant="outline" onClick={() => { setEditingCategory(null); setCategoryForm({ displayName: "", pricingTier: "0", sortOrder: "0", colorCode: "#1e3a8a" }) }}>New category</Button>}</div>
          </form>
          {deletingCategory && <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3"><p className="text-sm">Delete {deletingCategory.displayName}? Categories used by inventory, requests, or quotas cannot be deleted.</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDeletingCategory(null)} disabled={categorySaving}>Cancel</Button><Button type="button" size="sm" variant="destructive" onClick={deleteCategory} disabled={categorySaving}>{categorySaving ? "Deleting..." : "Delete"}</Button></div></div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setCategoryOpen(false); setEditingCategory(null); setDeletingCategory(null) }} disabled={categorySaving}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !deleteSaving) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete inventory pool</DialogTitle><DialogDescription>Delete {deleting?.standName} ({deleting?.ticketCategory.displayName})? Pools with allocation or serial history cannot be deleted.</DialogDescription></DialogHeader>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDeleting(null)} disabled={deleteSaving}>Cancel</Button><Button type="button" variant="destructive" onClick={deleteInventory} disabled={deleteSaving}>{deleteSaving ? "Deleting…" : "Delete pool"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
