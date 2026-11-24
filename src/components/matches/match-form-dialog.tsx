"use client"

import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { selectClassName } from "@/components/lifecycle/client"
import type { MatchOption } from "@/components/lifecycle/types"

interface Venue { id: string; name: string; city: string }
interface MatchFormDialogProps {
  open: boolean
  match: MatchOption | null
  venues: Venue[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const schema = z.object({
  title: z.string().trim().min(3, "Enter a match title"),
  tournament: z.string().trim(),
  format: z.enum(["TEST", "ODI", "T20", "T20I", "TOURNAMENT", "OTHER"]),
  matchDate: z.string().min(1, "Select a date and time"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  venueId: z.string().min(1, "Select a venue"),
  status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED", "CANCELLED"]),
  notes: z.string().trim().max(2000),
})
type Form = z.infer<typeof schema>
const initialForm: Form = { title: "", tournament: "", format: "ODI", matchDate: "", startTime: "13:30", venueId: "", status: "UPCOMING", notes: "" }

export function MatchFormDialog({ open, match, venues, onOpenChange, onSaved }: MatchFormDialogProps) {
  const [form, setForm] = React.useState<Form>(initialForm)
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setForm(match ? {
      title: match.title, tournament: match.tournament || "", format: match.format as Form["format"],
      matchDate: match.matchDate.slice(0, 16), startTime: match.startTime || "13:30",
      venueId: match.venueId || venues[0]?.id || "", status: (match.status || "UPCOMING") as Form["status"], notes: "",
    } : { ...initialForm, venueId: venues[0]?.id || "" })
    setError("")
  }, [open, match, venues])

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const result = schema.safeParse(form)
    if (!result.success) { setError(result.error.issues[0]?.message || "Check the match details"); return }
    setSaving(true)
    setError("")
    try {
      const payload = { ...result.data, matchDate: new Date(result.data.matchDate).toISOString(), ...(match ? {} : { status: undefined }) }
      const response = await fetch(match ? `/api/matches/${match.id}` : "/api/matches", {
        method: match ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body: unknown = await response.json()
      if (!response.ok) throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Unable to save match")
      onSaved()
      onOpenChange(false)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to save match")
    } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{match ? "Edit match" : "Create match"}</DialogTitle><DialogDescription>Schedule a match and its venue. Request windows and workflows can be configured after creation.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="match-title">Match title</Label><Input id="match-title" value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="India vs Australia – 2nd ODI" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="match-tournament">Tournament</Label><Input id="match-tournament" value={form.tournament} onChange={(event) => update("tournament", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="match-format">Format</Label><select id="match-format" className={selectClassName} value={form.format} onChange={(event) => update("format", event.target.value as Form["format"])}><option>ODI</option><option>TEST</option><option>T20</option><option>T20I</option><option>TOURNAMENT</option><option>OTHER</option></select></div>
          <div className="space-y-2"><Label htmlFor="match-date">Match date</Label><Input id="match-date" type="datetime-local" value={form.matchDate} onChange={(event) => update("matchDate", event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="match-time">Start time</Label><Input id="match-time" type="time" value={form.startTime} onChange={(event) => update("startTime", event.target.value)} required /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="match-venue">Venue</Label><select id="match-venue" className={selectClassName} value={form.venueId} onChange={(event) => update("venueId", event.target.value)} required><option value="">Select a venue</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}, {venue.city}</option>)}</select></div>
        {match && <div className="space-y-2"><Label htmlFor="match-status">Status</Label><select id="match-status" className={selectClassName} value={form.status} onChange={(event) => update("status", event.target.value as Form["status"])}>{["UPCOMING", "ACTIVE", "COMPLETED", "CANCELLED"].map((status) => <option key={status}>{status}</option>)}</select></div>}
        <div className="space-y-2"><Label htmlFor="match-notes">Notes (optional)</Label><Textarea id="match-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={3} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving || venues.length === 0}>{saving ? "Saving…" : match ? "Save changes" : "Create match"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
