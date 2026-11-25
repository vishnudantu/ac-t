"use client"

import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { postLifecycle } from "./client"
import { approvalDecisionError, type ApprovalAction } from "./rules"
import type { ApprovalStepRecord } from "./types"

interface DecisionDialogProps {
  step: ApprovalStepRecord | null
  action: ApprovalAction
  open: boolean
  onOpenChange: (open: boolean) => void
  onDecided: () => Promise<void>
}

const titles: Record<ApprovalAction, string> = {
  APPROVE: "Approve request",
  PARTIAL: "Record partial approval",
  REJECT: "Reject request",
  RETURN: "Return for clarification",
}

export function ApprovalDecisionDialog({ step, action, open, onOpenChange, onDecided }: DecisionDialogProps) {
  const [remarks, setRemarks] = useState("")
  const [confidentialRemarks, setConfidentialRemarks] = useState("")
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [availability, setAvailability] = useState<Record<string, { remaining: number; capacity: number }>>({})

  useEffect(() => {
    if (!step || !open) return
    fetch(`/api/availability?matchId=${encodeURIComponent(step.request.match.id)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { categories?: { id: string; remaining: number; capacity: number }[] }) => {
        const map: Record<string, { remaining: number; capacity: number }> = {}
        for (const row of body.categories || []) map[row.id] = { remaining: row.remaining, capacity: row.capacity }
        setAvailability(map)
      })
      .catch(() => setAvailability({}))
    setQuantities(Object.fromEntries(step.request.items.map((item) => [
      item.id,
      action === "APPROVE" ? item.requestedQuantity : item.approvedQuantity,
    ])))
    setRemarks("")
    setConfidentialRemarks("")
    setError(null)
  }, [action, open, step])

  if (!step) return null
  const isApproval = action === "APPROVE" || action === "PARTIAL"
  const quantityError = approvalDecisionError(action, step.request.items, quantities)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!step) return
    if (!remarks.trim()) return setError("Remarks are required for this decision.")
    if (quantityError) return setError(quantityError)
    if (isApproval) {
      const over = step.request.items.find((item) => {
        const available = item.ticketCategory ? availability[item.ticketCategory.id]?.remaining : undefined
        return available !== undefined && (quantities[item.id] ?? item.approvedQuantity) > available
      })
      if (over) {
        const available = over.ticketCategory ? availability[over.ticketCategory.id]?.remaining ?? 0 : 0
        return setError(`Insufficient ticket availability for ${over.ticketCategory?.displayName ?? "this category"}. Maximum available: ${available}.`)
      }
    }
    setSubmitting(true)
    setError(null)
    try {
      await postLifecycle("/api/approvals", {
        stepId: step.id,
        action,
        remarks: remarks.trim(),
        ...(confidentialRemarks.trim() ? { confidentialRemarks: confidentialRemarks.trim() } : {}),
        ...(isApproval ? { items: step.request.items.map((item) => ({ requestItemId: item.id, approvedQuantity: quantities[item.id] })) } : {}),
      })
      onOpenChange(false)
      await onDecided()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to record the decision.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!submitting) onOpenChange(value) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
          <DialogDescription>{step.request.requestNumber} · {step.request.requester.fullName} · {step.name}</DialogDescription>
        </DialogHeader>
        <form id="approval-decision-form" className="space-y-5" onSubmit={submit}>
          {isApproval && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Approved quantities</legend>
              {step.request.items.map((item, index) => (
                <div key={item.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_140px] sm:items-end">
                  <div>
                    <Label htmlFor={`approved-${item.id}`}>{item.ticketCategory?.displayName ?? `Request item ${index + 1}`}</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Requested {item.requestedQuantity} · Previously approved {item.approvedQuantity}</p>
                    {item.ticketCategory && availability[item.ticketCategory.id] && <p className={`mt-1 text-xs ${(quantities[item.id] ?? item.approvedQuantity) > availability[item.ticketCategory.id].remaining ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {availability[item.ticketCategory.id].remaining} of {availability[item.ticketCategory.id].capacity} available
                      {(quantities[item.id] ?? item.approvedQuantity) > availability[item.ticketCategory.id].remaining ? " — insufficient ticket availability" : ""}
                    </p>}
                  </div>
                  <Input
                    id={`approved-${item.id}`}
                    type="number"
                    min={item.approvedQuantity}
                    max={item.requestedQuantity}
                    step={1}
                    required
                    value={quantities[item.id] ?? item.approvedQuantity}
                    onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.valueAsNumber }))}
                    aria-describedby={`approved-bounds-${item.id}`}
                  />
                  <span id={`approved-bounds-${item.id}`} className="sr-only">Between {item.approvedQuantity} and {item.requestedQuantity}</span>
                </div>
              ))}
            </fieldset>
          )}
          <div className="space-y-2">
            <Label htmlFor="decision-remarks">Remarks <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Textarea id="decision-remarks" required maxLength={2000} rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Record the basis for this decision" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="decision-confidential">Confidential remarks <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="decision-confidential" maxLength={2000} rows={2} value={confidentialRemarks} onChange={(event) => setConfidentialRemarks(event.target.value)} placeholder="Internal notes for the approval record" />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        </form>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="approval-decision-form" variant={action === "REJECT" ? "destructive" : "default"} disabled={submitting}>
            {submitting ? "Recording…" : titles[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
