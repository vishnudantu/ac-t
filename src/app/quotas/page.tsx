"use client"

import { useState } from "react"
import { CheckCircle2, Layers3, Pencil, Plus, Shield } from "lucide-react"
import { MainLayout } from "@/components/layout/main-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getQuotas } from "@/components/operations/api"
import { DataState, EmptyState, MetricSkeleton, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination, SearchInput } from "@/components/operations/list-controls"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSession } from "@/hooks/use-session"
import { MetricCard } from "@/components/operations/metric-card"
import { PageHeader } from "@/components/operations/page-header"
import { useOperationData } from "@/components/operations/use-operation-data"
import type { Quota } from "@/components/operations/types"
import { formatNumber } from "@/lib/utils"

const PAGE_SIZE = 20

function QuotaPoolCard({ quota, onEdit }: { quota: Quota; onEdit?: (quota: Quota) => void }) {
  const remaining = Math.max(0, quota.totalAllocation - quota.consumedQuantity)

  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{quota.displayName}</CardTitle>
          <CardDescription className="mt-1">{quota.match.title} · {quota.owner ? `Owner: ${quota.owner.fullName}` : "No owner assigned"}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge className={quota.isActive ? "status-approved" : "status-closed"}>
            {quota.isActive ? "Active" : "Inactive"}
          </Badge>
          {onEdit && <Button variant="ghost" size="icon" aria-label={`Edit quota ${quota.displayName}`} onClick={() => onEdit(quota)}><Pencil className="h-4 w-4" /></Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <dl className="grid grid-cols-3 gap-3 border-y py-3">
          <div><dt className="text-xs text-muted-foreground">Total allocation</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatNumber(quota.totalAllocation)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Consumed</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatNumber(quota.consumedQuantity)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Remaining</dt><dd className="mt-1 text-lg font-bold tabular-nums text-green-700 dark:text-green-400">{formatNumber(remaining)}</dd></div>
        </dl>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category allocations</h3>
          {quota.quotaAllocations.length === 0 ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">No category allocations are linked to this quota.</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Ticket allocations and consumption by category</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Category</TableHead>
                  <TableHead scope="col" className="text-right">Allocated</TableHead>
                  <TableHead scope="col" className="text-right">Consumed</TableHead>
                  <TableHead scope="col" className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quota.quotaAllocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell><Badge variant="secondary">{allocation.ticketCategory.displayName}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(allocation.allocatedQuantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(allocation.consumedQuantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Math.max(0, allocation.allocatedQuantity - allocation.consumedQuantity))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {quota.childQuotas.length > 0 && (
          <p className="text-xs text-muted-foreground">Child quotas: {quota.childQuotas.map((child) => child.displayName).join(", ")}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function QuotasPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const { user } = useSession()
  const [matchId, setMatchId] = useState("all")
  const [matches, setMatches] = useState<{ id: string; title: string }[]>([])
  const [editing, setEditing] = useState<Quota | null>(null)
  const [editForm, setEditForm] = useState({ displayName: "", description: "", isActive: true })
  const [editError, setEditError] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState("")
  const [createSaving, setCreateSaving] = useState(false)
  const [createForm, setCreateForm] = useState({ matchId: "", name: "", displayName: "", description: "" })
  const [quotaCategories, setQuotaCategories] = useState<{ id: string; displayName: string }[]>([])
  const [quotaAllocations, setQuotaAllocations] = useState<{ ticketCategoryId: string; allocatedQuantity: string }[]>([])
  const canWrite = Boolean(user?.permissions.includes("quotas:write"))
  const { data, loading, error, retry } = useOperationData(
    (signal) => getQuotas(signal, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, matchId }),
    [page, matchId],
  )

  useState(() => {
    fetch("/api/matches?limit=100", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { matches?: { id: string; title: string }[] }) => setMatches(body.matches || []))
      .catch(() => setMatches([]))
  })

  async function openCreate() {
    setCreateError("")
    setCreateForm({ matchId: matchId === "all" ? "" : matchId, name: "", displayName: "", description: "" })
    setQuotaAllocations([])
    setCreateOpen(true)
  }

  async function loadQuotaCategories(selectedMatchId: string) {
    setCreateForm((current) => ({ ...current, matchId: selectedMatchId }))
    setQuotaAllocations([])
    if (!selectedMatchId) { setQuotaCategories([]); return }
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(selectedMatchId)}/categories`, { cache: "no-store" })
      const body = await response.json() as { categories?: { id: string; displayName: string }[] }
      setQuotaCategories(body.categories || [])
    } catch { setQuotaCategories([]) }
  }

  async function createQuota(event: React.FormEvent) {
    event.preventDefault()
    setCreateSaving(true)
    setCreateError("")
    try {
      const response = await fetch("/api/quotas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: createForm.matchId, name: createForm.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
          displayName: createForm.displayName, description: createForm.description || null,
          allocations: quotaAllocations.filter((item) => item.ticketCategoryId && Number(item.allocatedQuantity) > 0)
            .map((item) => ({ ticketCategoryId: item.ticketCategoryId, allocatedQuantity: Number(item.allocatedQuantity) })),
        }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to create quota")
      setCreateOpen(false)
      retry()
    } catch (cause: unknown) { setCreateError(cause instanceof Error ? cause.message : "Unable to create quota") } finally { setCreateSaving(false) }
  }

  function openEdit(quota: Quota) {
    setEditing(quota)
    setEditForm({ displayName: quota.displayName, description: "", isActive: quota.isActive })
    setEditError("")
  }

  async function saveQuota(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    setEditSaving(true)
    setEditError("")
    try {
      const response = await fetch(`/api/quotas/${encodeURIComponent(editing.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editForm.displayName, isActive: editForm.isActive }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to update quota")
      setEditing(null)
      retry()
    } catch (cause: unknown) { setEditError(cause instanceof Error ? cause.message : "Unable to update quota") } finally { setEditSaving(false) }
  }

  function changeMatch(value: string) {
    setMatchId(value)
    setPage(1)
  }

  const quotas = data?.quotas ?? []
  const query = search.trim().toLowerCase()
  const filteredQuotas = quotas.filter((quota) =>
    !query || [quota.name, quota.displayName, quota.match.title, quota.owner?.fullName,
      ...quota.quotaAllocations.map((allocation) => allocation.ticketCategory.displayName)]
      .some((value) => value?.toLowerCase().includes(query)),
  )
  const totals = quotas.reduce((result, quota) => ({
    allocation: result.allocation + quota.totalAllocation,
    consumed: result.consumed + quota.consumedQuantity,
  }), { allocation: 0, consumed: 0 })

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader
          title="Quota Management"
          description="Stakeholder quotas, category allocations, and recorded consumption."
          onRefresh={retry}
          refreshing={loading}
          actions={canWrite ? <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New quota</Button> : undefined}
        />
        {loading && !data ? <MetricSkeleton count={3} /> : error ? null : data && (
          <section aria-labelledby="quota-totals">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="quota-totals" className="text-sm font-semibold">Quota totals</h2>
              <p className="text-xs text-muted-foreground">Current page · {quotas.length} pools{data.total > quotas.length ? ` of ${data.total}` : ""}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Total allocation" value={totals.allocation} icon={Shield} tone="blue" />
              <MetricCard label="Consumed" value={totals.consumed} icon={CheckCircle2} tone="violet" />
              <MetricCard label="Remaining" value={Math.max(0, totals.allocation - totals.consumed)} icon={Layers3} tone="green" />
            </div>
          </section>
        )}
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_220px]">
              <SearchInput value={search} onChange={setSearch} label="Filter quotas on this page" placeholder="Filter this page by quota, match, owner, or category…" />
              <FilterSelect value={matchId} onChange={changeMatch} label="Match" options={[{ value: "all", label: "All matches" }, ...matches.map((match) => ({ value: match.id, label: match.title }))]} />
            </div>
          </CardContent>
        </Card>
        <section aria-labelledby="quota-list-title">
          <div className="mb-3">
            <h2 id="quota-list-title" className="text-lg font-semibold">Quota pools</h2>
            <p className="text-sm text-muted-foreground">{data ? `${formatNumber(data.total)} quota pools` : "Live quota records"}</p>
          </div>
          <DataState loading={loading} error={error} onRetry={retry} skeleton={<Card className="shadow-none"><TableSkeleton rows={5} /></Card>}>
            {filteredQuotas.length === 0 ? (
              <Card className="shadow-none">
                <EmptyState
                  icon={<Shield className="h-10 w-10" />}
                  title={query ? "No matching quotas" : "No quotas recorded"}
                  description={query ? "No quotas on this page match your search. Try another page or clear the search." : "Quota pools will appear here when they are available."}
                  onClear={query ? () => setSearch("") : undefined}
                />
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredQuotas.map((quota) => <QuotaPoolCard key={quota.id} quota={quota} onEdit={canWrite ? openEdit : undefined} />)}
              </div>
            )}
          </DataState>
          {data && !error && !loading && (
            <div className="mt-4 rounded-lg border bg-card shadow-none">
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} itemCount={filteredQuotas.length} onPageChange={setPage} filtered={Boolean(query)} />
            </div>
          )}
        </section>
      </div>
      <Dialog open={createOpen} onOpenChange={(open) => { if (!createSaving) setCreateOpen(open) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>New quota pool</DialogTitle><DialogDescription>Create a stakeholder quota and allocate ticket quantities per category for a match.</DialogDescription></DialogHeader>
          <form onSubmit={createQuota} className="space-y-4">
            {createError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{createError}</p>}
            <div className="space-y-2"><Label htmlFor="quota-match">Match</Label><select id="quota-match" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required value={createForm.matchId} onChange={(event) => loadQuotaCategories(event.target.value)} disabled={createSaving}><option value="">Select match</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</select></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="quota-code">Quota code</Label><Input id="quota-code" required minLength={2} maxLength={100} placeholder="ACA_OFFICIALS" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value.toUpperCase() })} disabled={createSaving} /></div>
              <div className="space-y-2"><Label htmlFor="quota-display">Display name</Label><Input id="quota-display" required minLength={2} maxLength={500} placeholder="ACA Officials" value={createForm.displayName} onChange={(event) => setCreateForm({ ...createForm, displayName: event.target.value })} disabled={createSaving} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="quota-desc">Description</Label><Input id="quota-desc" maxLength={2000} value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} disabled={createSaving} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">Category allocations</p><Button type="button" variant="outline" size="sm" onClick={() => setQuotaAllocations([...quotaAllocations, { ticketCategoryId: "", allocatedQuantity: "0" }])} disabled={createSaving || !createForm.matchId}><Plus className="mr-1 h-3.5 w-3.5" />Add category</Button></div>
              {quotaAllocations.length === 0 && <p className="text-xs text-muted-foreground">Select a match, then add categories with allocated quantities.</p>}
              {quotaAllocations.map((allocation, index) => <div key={index} className="grid grid-cols-[1fr_120px_auto] items-end gap-2">
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={allocation.ticketCategoryId} onChange={(event) => setQuotaAllocations(quotaAllocations.map((current, position) => position === index ? { ...current, ticketCategoryId: event.target.value } : current))} disabled={createSaving}><option value="">Select category</option>{quotaCategories.map((category) => <option key={category.id} value={category.id}>{category.displayName}</option>)}</select>
                <Input type="number" min={1} value={allocation.allocatedQuantity} onChange={(event) => setQuotaAllocations(quotaAllocations.map((current, position) => position === index ? { ...current, allocatedQuantity: event.target.value } : current))} disabled={createSaving} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove allocation" onClick={() => setQuotaAllocations(quotaAllocations.filter((_, position) => position !== index))} disabled={createSaving}>×</Button>
              </div>)}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>Cancel</Button><Button type="submit" disabled={createSaving}>{createSaving ? "Creating…" : "Create quota"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !editSaving) setEditing(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit quota pool</DialogTitle><DialogDescription>Update “{editing?.displayName}” for {editing?.match.title}.</DialogDescription></DialogHeader>
          <form onSubmit={saveQuota} className="space-y-4">
            {editError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{editError}</p>}
            <div className="space-y-2"><Label htmlFor="quota-name">Display name</Label><Input id="quota-name" required minLength={2} maxLength={500} value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} disabled={editSaving} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.isActive} onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} disabled={editSaving} />Active (available for new requests and allocations)</label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={editSaving}>Cancel</Button><Button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
