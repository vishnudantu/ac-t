"use client"

import * as React from "react"
import { Building2, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { useToast } from "@/hooks/use-toast"
import { formatNumber } from "@/lib/utils"

interface Venue {
  id: string
  name: string
  shortName: string
  city: string
  state: string
  country: string
  capacity: number | null
}

const emptyForm = { name: "", shortName: "", city: "", state: "", country: "India", capacity: "" }

export default function VenuesPage() {
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()
  const [venues, setVenues] = React.useState<Venue[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Venue | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState("")
  const [deleting, setDeleting] = React.useState<Venue | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const canWrite = Boolean(user?.permissions.includes("matches:write"))
  const canDelete = Boolean(user?.roles?.includes("SUPER_ADMIN"))

  React.useEffect(() => {
    if (sessionLoading) return
    const controller = new AbortController()
    setLoading(true)
    fetch("/api/venues", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { venues?: Venue[]; error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to load venues")
      setVenues(body.venues || [])
      setError("")
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load venues") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [sessionLoading, attempt])

  function openForm(venue: Venue | null) {
    setEditing(venue)
    setFormError("")
    setForm(venue ? {
      name: venue.name, shortName: venue.shortName, city: venue.city, state: venue.state,
      country: venue.country, capacity: venue.capacity === null ? "" : String(venue.capacity),
    } : emptyForm)
    setFormOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError("")
    try {
      const response = await fetch(editing ? `/api/venues/${encodeURIComponent(editing.id)}` : "/api/venues", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, shortName: form.shortName, city: form.city, state: form.state,
          ...(editing ? {} : { country: form.country }),
          capacity: form.capacity === "" ? null : Number(form.capacity),
        }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to save venue")
      toast({ title: editing ? "Venue updated" : "Venue created", description: form.name })
      setFormOpen(false)
      setAttempt((value) => value + 1)
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save venue")
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setSaving(true)
    try {
      const response = await fetch(`/api/venues/${encodeURIComponent(deleting.id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to delete venue")
      toast({ title: "Venue deleted", description: deleting.name })
      setDeleting(null)
      setAttempt((value) => value + 1)
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : "Unable to delete venue")
    } finally {
      setSaving(false)
    }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader
      title="Venues"
      description="Stadiums and grounds available when scheduling a match."
      onRefresh={() => setAttempt((value) => value + 1)}
      refreshing={loading}
      actions={canWrite ? <Button size="sm" onClick={() => openForm(null)}><Plus className="mr-2 h-4 w-4" />New venue</Button> : undefined}
    />
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
      {venues.length === 0
        ? <Card><EmptyState icon={<Building2 className="h-10 w-10" />} title="No venues yet" description="Add a stadium or ground to schedule matches." /></Card>
        : <Card className="shadow-none"><CardHeader className="p-4 pb-3"><CardTitle className="text-lg">Venue directory</CardTitle><CardDescription>{venues.length} active venues</CardDescription></CardHeader><CardContent className="p-0"><Table>
          <TableHeader><TableRow><TableHead scope="col">Venue</TableHead><TableHead scope="col">City</TableHead><TableHead scope="col">State</TableHead><TableHead scope="col" className="text-right">Capacity</TableHead>{(canWrite || canDelete) && <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
          <TableBody>{venues.map((venue) => <TableRow key={venue.id}>
            <TableCell><p className="font-medium">{venue.name}</p><p className="text-xs text-muted-foreground">{venue.shortName}</p></TableCell>
            <TableCell><span className="flex items-center gap-1.5 text-sm"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{venue.city}</span></TableCell>
            <TableCell className="text-sm">{venue.state}</TableCell>
            <TableCell className="text-right text-lg font-bold tabular-nums text-primary">{venue.capacity === null ? "—" : formatNumber(venue.capacity)}</TableCell>
            {(canWrite || canDelete) && <TableCell><div className="flex justify-end gap-1">
              {canWrite && <Button variant="ghost" size="icon" aria-label={`Edit ${venue.name}`} onClick={() => openForm(venue)}><Pencil className="h-4 w-4" /></Button>}
              {canDelete && <Button variant="ghost" size="icon" aria-label={`Delete ${venue.name}`} onClick={() => { setFormError(""); setDeleting(venue) }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            </div></TableCell>}
          </TableRow>)}</TableBody>
        </Table></CardContent></Card>}
    </DataState>

    <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open) }}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit venue" : "New venue"}</DialogTitle><DialogDescription>Venue details are used on match schedules and printed reports.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
        <div className="space-y-2"><Label htmlFor="venue-name">Venue name</Label><Input id="venue-name" required minLength={2} maxLength={250} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="venue-short">Short name</Label><Input id="venue-short" required minLength={2} maxLength={100} value={form.shortName} onChange={(event) => setForm({ ...form, shortName: event.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="venue-city">City</Label><Input id="venue-city" required minLength={2} maxLength={100} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="venue-state">State</Label><Input id="venue-state" required minLength={2} maxLength={100} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="venue-capacity">Capacity</Label><Input id="venue-capacity" type="number" min={1} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create venue"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>

    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>Delete venue</DialogTitle><DialogDescription>Delete {deleting?.name}? Venues used by a match cannot be deleted.</DialogDescription></DialogHeader>
      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={() => setDeleting(null)} disabled={saving}>Cancel</Button><Button type="button" variant="destructive" onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Delete venue"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div></MainLayout>
}
