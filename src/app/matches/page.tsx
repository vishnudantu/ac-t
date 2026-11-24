"use client"

import { useState } from "react"
import { CalendarDays, MapPin, Trophy, Plus, Pencil, Trash2, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"
import { MatchFormDialog } from "@/components/matches/match-form-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { postLifecycle } from "@/components/lifecycle/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MatchOption } from "@/components/lifecycle/types"

interface Venue { id: string; name: string; city: string }
interface MatchRecord extends MatchOption {
  tournament: string | null
  format: string
  startTime: string
  status: string
  requestOpensAt: string | null
  requestClosesAt: string | null
  totalInventory: number
  venue: { name: string; city: string }
  _count: { requests: number; ticketCategories: number; inventoryPools: number }
}
import { MainLayout } from "@/components/layout/main-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getMatches } from "@/components/operations/api"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination, SearchInput } from "@/components/operations/list-controls"
import { PageHeader } from "@/components/operations/page-header"
import { useOperationData } from "@/components/operations/use-operation-data"
import { formatDate, formatNumber, formatStatus, getStatusColor } from "@/lib/utils"

const PAGE_SIZE = 20
const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "POSTPONED", label: "Postponed" },
]

export default function MatchesPage() {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(1)
  const { user } = useSession()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MatchRecord | null>(null)
  const [deleting, setDeleting] = useState<MatchRecord | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [actionError, setActionError] = useState("")
  const [categoryMatch, setCategoryMatch] = useState<MatchRecord | null>(null)
  const [categoryList, setCategoryList] = useState<{ id: string; name: string; displayName: string; sortOrder: number; pricingTier: number; _count?: { inventoryPools: number; requestItems: number } }[]>([])
  const [categoryForm, setCategoryForm] = useState({ displayName: "", pricingTier: "0", sortOrder: "0", colorCode: "#1e3a8a" })
  const [categoryError, setCategoryError] = useState("")
  const [categorySaving, setCategorySaving] = useState(false)
  const canWrite = Boolean(user?.permissions.includes("matches:write"))
  const canDelete = Boolean(user?.roles?.includes("SUPER_ADMIN"))
  const { data, loading, error, retry } = useOperationData(
    (signal) => getMatches(signal, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, status }),
    [page, status],
  )

  const matches = (data?.matches ?? []) as MatchRecord[]

  async function openForm(match: MatchRecord | null) {
    setEditing(match)
    const response = await fetch("/api/venues", { cache: "no-store" })
    const body = await response.json() as { venues?: Venue[]; error?: string }
    if (!response.ok) { setActionError(body.error || "Unable to load venues"); return }
    setVenues(body.venues ?? [])
    setFormOpen(true)
  }

  async function openCategories(match: MatchRecord) {
    setCategoryMatch(match)
    setCategoryError("")
    setCategoryForm({ displayName: "", pricingTier: "0", sortOrder: "0", colorCode: "#1e3a8a" })
    await loadCategories(match.id)
  }

  async function loadCategories(matchId: string) {
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/categories`, { cache: "no-store" })
      const body = await response.json() as { categories?: typeof categoryList; error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to load ticket categories")
      setCategoryList(body.categories || [])
    } catch (cause: unknown) {
      setCategoryError(cause instanceof Error ? cause.message : "Unable to load ticket categories")
    }
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault()
    if (!categoryMatch) return
    setCategorySaving(true)
    setCategoryError("")
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(categoryMatch.id)}/categories`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryForm.displayName, displayName: categoryForm.displayName,
          pricingTier: Number(categoryForm.pricingTier), sortOrder: Number(categoryForm.sortOrder),
          colorCode: categoryForm.colorCode,
        }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to add ticket category")
      setCategoryForm({ displayName: "", pricingTier: "0", sortOrder: String(categoryList.length + 1), colorCode: "#1e3a8a" })
      await loadCategories(categoryMatch.id)
    } catch (cause: unknown) {
      setCategoryError(cause instanceof Error ? cause.message : "Unable to add ticket category")
    } finally {
      setCategorySaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setActionError("")
    try {
      const response = await fetch(`/api/matches/${deleting.id}`, { method: "DELETE" })
      const body: unknown = await response.json()
      if (!response.ok) throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Unable to delete match")
      setDeleting(null)
      retry()
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete match")
    }
  }
  const query = search.trim().toLowerCase()
  const filteredMatches = matches.filter((match) =>
    !query || [match.title, match.tournament, match.venue.name, match.venue.city]
      .some((value) => value?.toLowerCase().includes(query)),
  )

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
          title="Matches"
          description="Match schedules, venues, request windows, and linked operational records."
          onRefresh={retry}
          refreshing={loading}
          actions={canWrite ? <Button size="sm" onClick={() => { void openForm(null) }}><Plus className="mr-2 h-4 w-4" />New match</Button> : undefined}
        />
        {actionError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}
        <Card className="shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={search}
              onChange={setSearch}
              label="Filter matches on this page"
              placeholder="Filter this page by match or venue…"
            />
            <FilterSelect value={status} onChange={changeStatus} label="Status" options={statusOptions} />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-lg">Match schedule</CardTitle>
            <CardDescription>
              {data ? `${formatNumber(data.total)} ${status === "all" ? "matches" : `${formatStatus(status).toLowerCase()} matches`}` : "Live match records"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataState loading={loading} error={error} onRetry={retry} skeleton={<TableSkeleton rows={5} />}>
              {filteredMatches.length === 0 ? (
                <EmptyState
                  icon={<Trophy className="h-10 w-10" />}
                  title={query || status !== "all" ? "No matching matches" : "No matches recorded"}
                  description={query
                    ? "No records on this page match your search. Try another page or clear the search."
                    : status !== "all"
                      ? "There are no matches with this status."
                      : "Match records will appear here when they are available."}
                  onClear={query || status !== "all" ? clearFilters : undefined}
                />
              ) : (
                <Table>
                  <TableCaption className="sr-only">Match schedules and operational counts</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Match</TableHead>
                      <TableHead scope="col">Date &amp; venue</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Request window</TableHead>
                      <TableHead scope="col" className="text-right">Requests</TableHead>
                      <TableHead scope="col" className="text-right">Inventory pools</TableHead>
                      <TableHead scope="col" className="text-right">Stock</TableHead>
                      {(canWrite || canDelete) && <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMatches.map((match) => (
                      <TableRow key={match.id}>
                        <TableCell className="min-w-56">
                          <div className="font-medium">{match.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{match.tournament || "Tournament not specified"}</div>
                          <Badge variant="secondary" className="mt-2">{match.format}</Badge>
                        </TableCell>
                        <TableCell className="min-w-52">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            <span>{formatDate(match.matchDate)} · {match.startTime}</span>
                          </div>
                          <div className="mt-1.5 flex max-w-64 items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{match.venue.name}, {match.venue.city}</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge className={getStatusColor(match.status)}>{formatStatus(match.status)}</Badge></TableCell>
                        <TableCell className="min-w-40 text-xs">
                          {match.requestOpensAt || match.requestClosesAt ? (
                            <>
                              <div>{match.requestOpensAt ? formatDate(match.requestOpensAt) : "Not set"}</div>
                              <div className="mt-1 text-muted-foreground">to {match.requestClosesAt ? formatDate(match.requestClosesAt) : "Not set"}</div>
                            </>
                          ) : <span className="text-muted-foreground">Not scheduled</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatNumber(match._count.requests)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(match._count.inventoryPools)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(match.totalInventory)}</TableCell>
                        {(canWrite || canDelete) && <TableCell className="whitespace-nowrap text-right">
                          <Button variant="ghost" size="icon" onClick={() => { void openCategories(match) }} aria-label={`Ticket categories for ${match.title}`}><Tags className="h-4 w-4" /></Button>
                          {canWrite && <Button variant="ghost" size="icon" onClick={() => { void openForm(match) }} aria-label={`Edit ${match.title}`}><Pencil className="h-4 w-4" /></Button>}
                          {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleting(match)} aria-label={`Delete ${match.title}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                        </TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataState>
          </CardContent>
          {data && !error && !loading && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              itemCount={filteredMatches.length}
              onPageChange={setPage}
              filtered={Boolean(query)}
            />
          )}
        </Card>
      </div>
      <MatchFormDialog open={formOpen} match={editing} venues={venues} onOpenChange={setFormOpen} onSaved={retry} />
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete match permanently?</DialogTitle><DialogDescription>Delete “{deleting?.title}” and every related record — requests, approvals, allocations, issuance, inventory, quotas, ticket categories and audit events. This cannot be undone.</DialogDescription></DialogHeader>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Keep match</Button><Button variant="destructive" onClick={() => { void confirmDelete() }}>Delete match and records</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(categoryMatch)} onOpenChange={(open) => { if (!open && !categorySaving) setCategoryMatch(null) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Ticket categories</DialogTitle><DialogDescription>Categories available for “{categoryMatch?.title}”. Inventory pools and requests are created against these.</DialogDescription></DialogHeader>
          {categoryError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{categoryError}</p>}
          <div className="max-h-56 overflow-y-auto rounded-md border">
            {categoryList.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No categories yet. Add the first one below.</p> : <ul className="divide-y">{categoryList.map((category) => <li key={category.id} className="flex items-center justify-between gap-3 p-3 text-sm"><span className="font-medium">{category.displayName}</span><span className="font-mono text-xs text-muted-foreground">{category.name} · tier {category.pricingTier}</span></li>)}</ul>}
          </div>
          <form onSubmit={addCategory} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Add category</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="category-name">Display name</Label><Input id="category-name" required minLength={2} maxLength={100} placeholder="e.g. Premium" value={categoryForm.displayName} onChange={(event) => setCategoryForm({ ...categoryForm, displayName: event.target.value })} disabled={categorySaving} /></div>
              <div className="space-y-2"><Label htmlFor="category-tier">Pricing tier</Label><Input id="category-tier" type="number" min={0} max={10} value={categoryForm.pricingTier} onChange={(event) => setCategoryForm({ ...categoryForm, pricingTier: event.target.value })} disabled={categorySaving} /></div>
              <div className="space-y-2"><Label htmlFor="category-order">Sort order</Label><Input id="category-order" type="number" min={0} value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })} disabled={categorySaving} /></div>
              <div className="space-y-2"><Label htmlFor="category-colour">Colour</Label><Input id="category-colour" type="color" className="h-10 p-1" value={categoryForm.colorCode} onChange={(event) => setCategoryForm({ ...categoryForm, colorCode: event.target.value })} disabled={categorySaving} /></div>
            </div>
            <Button type="submit" size="sm" disabled={categorySaving}>{categorySaving ? "Adding…" : "Add category"}</Button>
          </form>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCategoryMatch(null)} disabled={categorySaving}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
