"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AllocationConfirmation } from "./allocation-confirmation"
import { postLifecycle, selectClassName } from "./client"
import { issueFormError, parseSerialNumbers } from "./rules"
import type { AllocationRecord, DistributionBatch, IssuanceGroup } from "./types"

interface IssueTicketsDialogProps {
  open: boolean
  groups: IssuanceGroup[]
  batches: DistributionBatch[]
  drafts: AllocationRecord[]
  loading: boolean
  loadError: string | null
  canConfirm: boolean
  canReadRequests: boolean
  initialBatchId?: string
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void>
}

export function IssueTicketsDialog({ open, groups, batches, drafts, loading, loadError, canConfirm, canReadRequests, initialBatchId, onOpenChange, onChanged }: IssueTicketsDialogProps) {
  const previousSubmission = useRef<{ payload: string; key: string } | null>(null)
  const [selection, setSelection] = useState("")
  const [draftId, setDraftId] = useState("")
  const [batchId, setBatchId] = useState("")
  const [method, setMethod] = useState("PHYSICAL")
  const [quantity, setQuantity] = useState(1)
  const [recipientName, setRecipientName] = useState("")
  const [recipientMobile, setRecipientMobile] = useState("")
  const [serialText, setSerialText] = useState("")
  const [seatDetails, setSeatDetails] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    previousSubmission.current = null
    setSelection("")
    setDraftId("")
    setQuantity(1)
    setRecipientName("")
    setRecipientMobile("")
    setSerialText("")
    setSeatDetails("")
    setNotes("")
    setError(null)
  }, [open])
  useEffect(() => {
    if (open) {
      setBatchId(initialBatchId ?? "")
      setMethod(batches.find((batch) => batch.id === initialBatchId)?.distributionMethod ?? "PHYSICAL")
    }
  }, [batches, initialBatchId, open])

  const group = groups.find((candidate) => candidate.item.id === selection)
  const draft = drafts.find((allocation) => allocation.id === draftId)
  const compatibleBatches = batches.filter((batch) => !["COMPLETED", "CANCELLED"].includes(batch.status) && (!group || batch.match.id === group.allocation.match.id))
  const validation = group ? issueFormError({ quantity, recipientName, serialText }, group.remaining) : null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!group) return setError("Select an available allocation item.")
    if (validation) return setError(validation)
    const serialNumbers = parseSerialNumbers(serialText)
    setSubmitting(true)
    setError(null)
    try {
      const submission = {
        action: "ISSUE",
        ...(batchId ? { batchId } : { distributionMethod: method }),
        items: [{
          allocationItemId: group.item.id, quantity, recipientName: recipientName.trim(),
          ...(recipientMobile.trim() ? { recipientMobile: recipientMobile.trim() } : {}),
          ...(serialNumbers.length ? { serialNumbers } : {}),
          ...(seatDetails.trim() ? { seatDetails: seatDetails.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }],
      }
      const payload = JSON.stringify(submission)
      if (previousSubmission.current?.payload !== payload) {
        previousSubmission.current = { payload, key: crypto.randomUUID() }
      }
      await postLifecycle("/api/distribution", { ...submission, idempotencyKey: previousSubmission.current.key })
      previousSubmission.current = null
      onOpenChange(false)
      await onChanged()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to issue tickets.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!submitting) onOpenChange(value) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Issue tickets</DialogTitle><DialogDescription>Issue from a confirmed allocation. Quantities are checked against current approvals and issuances.</DialogDescription></DialogHeader>
        <form id="issue-tickets-form" className="space-y-4" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="issue-allocation">Confirmed allocation item</Label><select id="issue-allocation" className={selectClassName} required disabled={loading || groups.length === 0} value={selection} onChange={(event) => { setSelection(event.target.value); setQuantity(1); if (!initialBatchId) setBatchId("") }}><option value="">{loading ? "Checking allocations…" : groups.length ? "Select an allocation item" : "No issuable allocation items"}</option>{groups.map((candidate) => <option key={candidate.item.id} value={candidate.item.id}>{candidate.allocation.allocationNumber} · {candidate.item.ticketCategory.displayName} · {candidate.remaining} remaining</option>)}</select>{!canReadRequests && <p className="text-xs text-muted-foreground">Detailed cross-request remaining checks require requests:read. The server validates every issuance.</p>}</div>
          {group && <div className="rounded-md bg-muted/50 p-3 text-sm"><p className="font-medium">{group.allocation.request.requestNumber} · {group.allocation.request.requester.fullName}</p><p className="mt-1 text-muted-foreground">{group.allocation.match.title} · {group.item.standName}{group.item.blockName ? ` · Block ${group.item.blockName}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">Allocated {group.item.quantity} · Approved for request item {group.item.requestItem.approvedQuantity} · Available to issue {group.remaining}</p></div>}
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="issue-batch">Existing batch <span className="font-normal text-muted-foreground">(optional)</span></Label><select id="issue-batch" className={selectClassName} value={batchId} onChange={(event) => { setBatchId(event.target.value); const batch = batches.find((candidate) => candidate.id === event.target.value); if (batch) setMethod(batch.distributionMethod) }}><option value="">Create a new batch</option>{compatibleBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.match.title}</option>)}</select></div><div className="space-y-2"><Label htmlFor="issue-method">Distribution method</Label><select id="issue-method" className={selectClassName} value={method} disabled={Boolean(batchId)} onChange={(event) => setMethod(event.target.value)}><option value="PHYSICAL">Physical</option><option value="DIGITAL">Digital</option><option value="BOTH">Physical and digital</option></select></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="issue-quantity">Quantity</Label><Input id="issue-quantity" type="number" required min={1} max={group?.remaining ?? 1} step={1} value={quantity} disabled={!group} onChange={(event) => setQuantity(event.target.valueAsNumber)} /></div><div className="space-y-2"><Label htmlFor="issue-recipient">Recipient name</Label><Input id="issue-recipient" required maxLength={500} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></div></div>
          <div className="space-y-2"><Label htmlFor="issue-mobile">Recipient mobile <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="issue-mobile" type="tel" minLength={5} maxLength={30} value={recipientMobile} onChange={(event) => setRecipientMobile(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="issue-serials">Serial numbers <span className="font-normal text-muted-foreground">(optional; comma or new-line separated)</span></Label><Textarea id="issue-serials" rows={3} value={serialText} onChange={(event) => setSerialText(event.target.value)} placeholder={group ? `Leave blank or enter exactly ${quantity || 0} unique serials` : "Select an item first"} /><p className="text-xs text-muted-foreground">If supplied, the serial count must equal the quantity. Serial availability is verified by the server.</p></div>
          <div className="space-y-2"><Label htmlFor="issue-seats">Seat details <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="issue-seats" maxLength={2000} value={seatDetails} onChange={(event) => setSeatDetails(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="issue-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="issue-notes" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          {(loadError || error || validation) && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{loadError ?? error ?? validation}</AlertDescription></Alert>}
        </form>
        {canConfirm && drafts.length > 0 && <section className="rounded-md border p-3" aria-labelledby="draft-confirmation-title"><h3 id="draft-confirmation-title" className="text-sm font-semibold">Confirm a draft allocation</h3><p className="mb-3 mt-1 text-xs text-muted-foreground">Confirmation changes the allocation and all reserved items to confirmed.</p><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1 space-y-2"><Label htmlFor="draft-allocation">Draft allocation</Label><select id="draft-allocation" className={selectClassName} value={draftId} onChange={(event) => setDraftId(event.target.value)}><option value="">Select a draft</option>{drafts.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.allocationNumber} · {allocation.request.requestNumber}</option>)}</select></div>{draft && <AllocationConfirmation allocation={draft} onConfirmed={async () => { setDraftId(""); await onChanged() }} />}</div></section>}
        <DialogFooter className="gap-2 sm:space-x-0"><Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="issue-tickets-form" disabled={submitting || loading || !group || Boolean(validation)}>{submitting ? "Issuing…" : "Issue tickets"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
