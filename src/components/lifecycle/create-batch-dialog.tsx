"use client"

import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { postLifecycle, selectClassName } from "./client"
import type { MatchOption } from "./types"

interface CreateBatchDialogProps {
  open: boolean
  matches: MatchOption[]
  fallbackMatches: MatchOption[]
  matchesLoading: boolean
  fallbackLoading: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<void>
}

export function CreateBatchDialog({ open, matches, fallbackMatches, matchesLoading, fallbackLoading, onOpenChange, onCreated }: CreateBatchDialogProps) {
  const options = matches.length > 0 ? matches : fallbackMatches
  const loading = matches.length > 0 ? matchesLoading : fallbackLoading
  const [matchId, setMatchId] = useState("")
  const [method, setMethod] = useState("PHYSICAL")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setMatchId("")
    setMethod("PHYSICAL")
    setNotes("")
    setError(null)
  }, [open])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!matchId) return setError("Select a match for this batch.")
    setSubmitting(true)
    setError(null)
    try {
      await postLifecycle("/api/distribution", {
        action: "CREATE_BATCH", matchId, distributionMethod: method,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      onOpenChange(false)
      await onCreated()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to create batch.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!submitting) onOpenChange(value) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create distribution batch</DialogTitle><DialogDescription>Group ticket issuances for one match and delivery method.</DialogDescription></DialogHeader>
        <form id="create-batch-form" className="space-y-4" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="batch-match">Match</Label><select id="batch-match" required className={selectClassName} value={matchId} disabled={loading || options.length === 0} onChange={(event) => setMatchId(event.target.value)}><option value="">{loading ? "Loading matches…" : options.length ? "Select a match" : "No matches available"}</option>{options.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="batch-method">Distribution method</Label><select id="batch-method" className={selectClassName} value={method} onChange={(event) => setMethod(event.target.value)}><option value="PHYSICAL">Physical</option><option value="DIGITAL">Digital</option><option value="BOTH">Physical and digital</option></select></div>
          <div className="space-y-2"><Label htmlFor="batch-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="batch-notes" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Preparation or handover instructions" /></div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </form>
        <DialogFooter className="gap-2 sm:space-x-0"><Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="create-batch-form" disabled={submitting || loading || !matchId}>{submitting ? "Creating…" : "Create batch"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
