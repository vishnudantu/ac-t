"use client"

import * as React from "react"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface MatchOption { id: string; title: string; matchDate?: string }
interface Venue { id: string; name: string; city: string }

interface ReplicateMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matches: MatchOption[]
  venues: Venue[]
  onReplicated: () => void
}

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"

export function ReplicateMatchDialog({ open, onOpenChange, matches, venues, onReplicated }: ReplicateMatchDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = React.useState({ sourceMatchId: "", title: "", tournament: "", matchDate: "", startTime: "13:30", venueId: "", copyCategories: true, copyInventory: true, copyQuotas: false })
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setForm({ sourceMatchId: "", title: "", tournament: "", matchDate: "", startTime: "13:30", venueId: venues[0]?.id || "", copyCategories: true, copyInventory: true, copyQuotas: false })
    setError("")
    setSaving(false)
  }, [open, venues])

  React.useEffect(() => {
    const source = matches.find((match) => match.id === form.sourceMatchId)
    if (source) {
      setForm((current) => ({ ...current, title: current.title || `${source.title} (copy)`, tournament: current.tournament || "" }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sourceMatchId])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form.sourceMatchId || !form.title.trim() || !form.matchDate || !form.venueId) { setError("Select a source match, venue, title and date"); return }
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/matches/replicate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMatchId: form.sourceMatchId, title: form.title, tournament: form.tournament || null,
          matchDate: new Date(form.matchDate).toISOString(), startTime: form.startTime, venueId: form.venueId,
          copyCategories: form.copyCategories, copyInventory: form.copyInventory, copyQuotas: form.copyQuotas,
        }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to replicate match")
      toast({ title: "Match replicated", description: `${form.title} created with its stands and inventory.` })
      onOpenChange(false)
      onReplicated()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to replicate match")
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>Replicate a match</DialogTitle><DialogDescription>Copy the stands, ticket categories and inventory pools from an existing match so you do not re-enter every stand.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="space-y-2"><Label htmlFor="replicate-source">Copy setup from</Label><select id="replicate-source" className={selectClass} required value={form.sourceMatchId} onChange={(event) => setForm({ ...form, sourceMatchId: event.target.value })} disabled={saving}><option value="">Select an existing match</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="replicate-title">New match title</Label><Input id="replicate-title" required minLength={2} maxLength={250} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} disabled={saving} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="replicate-tournament">Tournament</Label><Input id="replicate-tournament" maxLength={250} value={form.tournament} onChange={(event) => setForm({ ...form, tournament: event.target.value })} disabled={saving} /></div>
          <div className="space-y-2"><Label htmlFor="replicate-venue">Venue</Label><select id="replicate-venue" className={selectClass} required value={form.venueId} onChange={(event) => setForm({ ...form, venueId: event.target.value })} disabled={saving}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}, {venue.city}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="replicate-date">Match date</Label><Input id="replicate-date" type="date" required value={form.matchDate} onChange={(event) => setForm({ ...form, matchDate: event.target.value })} disabled={saving} /></div>
          <div className="space-y-2"><Label htmlFor="replicate-time">Start time</Label><Input id="replicate-time" type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} disabled={saving} /></div>
        </div>
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Copy from source match</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.copyCategories} onChange={(event) => setForm({ ...form, copyCategories: event.target.checked })} disabled={saving} />Ticket categories</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.copyInventory} onChange={(event) => setForm({ ...form, copyInventory: event.target.checked })} disabled={saving} />Inventory pools (stands, blocks, gates, quantities)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.copyQuotas} onChange={(event) => setForm({ ...form, copyQuotas: event.target.checked })} disabled={saving} />Quota pools and category allocations</label>
        </fieldset>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}><Copy className="mr-2 h-4 w-4" />{saving ? "Replicating…" : "Replicate match"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
