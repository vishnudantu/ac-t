"use client"

import { postLifecycle } from "./client"
import Link from "next/link"
import { useState } from "react"
import { ArrowUp, Check, ClipboardCheck, Split, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatNumber, formatPhone, formatStatus, getPriorityColor, getStatusColor } from "@/lib/utils"
import { EmptyState } from "@/components/operations/data-state"
import { ApprovalDecisionDialog } from "./approval-decision-dialog"
import type { ApprovalAction } from "./rules"
import type { ApprovalStepRecord } from "./types"

interface ApprovalQueueProps {
  steps: ApprovalStepRecord[]
  canDecide: boolean
  historical: boolean
  filtered: boolean
  onClear: () => void
  onDecided: () => Promise<void>
}

export function ApprovalQueue({ steps, canDecide, historical, filtered, onClear, onDecided }: ApprovalQueueProps) {
  const [selected, setSelected] = useState<ApprovalStepRecord | null>(null)
  const [action, setAction] = useState<ApprovalAction>("APPROVE")

  const [saving, setSaving] = useState(false)
  const [decisionError, setDecisionError] = useState("")
  async function approveFull(step: ApprovalStepRecord) {
    setSaving(true)
    setDecisionError("")
    try {
      await postLifecycle("/api/approvals", {
        stepId: step.id, requestVersion: step.request.version, action: "APPROVE",
        items: step.request.items.map(item => ({ requestItemId: item.id, approvedQuantity: item.requestedQuantity })),
      })
      await onDecided()
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Approval failed")
    } finally {
      setSaving(false)
    }
  }

  function openDecision(step: ApprovalStepRecord, decision: ApprovalAction) {
    setSelected(step)
    setAction(decision)
  }

  if (steps.length === 0) {
    return <Card className="shadow-none"><EmptyState icon={<ClipboardCheck className="h-10 w-10" />} title={filtered ? "No matching approval steps" : historical ? "No approval history" : "No approvals awaiting review"} description={filtered ? "No steps on this page match your search. Try another page or clear the search." : historical ? "Completed decisions assigned to you will appear here." : "Your assigned approval queue is clear."} onClear={filtered ? onClear : undefined} /></Card>
  }

  return (
    <div className="space-y-3">
      {decisionError && <p role="alert">{decisionError}</p>}
      {steps.map((step) => {
        const request = step.request
        const actionable = canDecide && !historical && ["PENDING", "IN_PROGRESS"].includes(step.status)
        return (
          <Card key={step.id} className="border-l-2 border-l-primary/60 shadow-none">
            <CardContent className="p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px]">
                <div className="min-w-0 overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/requests/${request.id}`} className="font-mono text-sm font-semibold text-primary hover:underline">{request.requestNumber}</Link>
                    <Badge className={getPriorityColor(request.priority)}>{formatStatus(request.priority)}</Badge>
                    <Badge className={getStatusColor(step.status)}>{formatStatus(step.status)}</Badge>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">{request.requester.fullName}</h2>
                  <p className="text-sm text-muted-foreground">{formatPhone(request.requester.mobileNumber)}</p>
                  <p className="text-sm text-muted-foreground">{request.match.title} · {formatDate(request.match.matchDate)}</p>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <p><span className="font-medium text-foreground">Step {step.stepOrder}</span><br />{step.name}</p>
                    <p><span className="font-medium text-foreground">Assignment</span><br />{step.assignedTo?.fullName ?? step.assignedRole?.displayName ?? "Unassigned"}</p>
                    <p><span className="font-medium text-foreground">Submitted</span><br />{formatDate(request.submittedAt ?? step.createdAt)}</p>
                    <p><span className="font-medium text-foreground">{historical ? "Completed" : "Deadline"}</span><br />{(historical ? step.completedAt : step.deadlineAt) ? formatDate((historical ? step.completedAt : step.deadlineAt) as string) : "Not recorded"}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 border-y py-3 xl:border-x xl:border-y-0 xl:px-4 xl:py-0 xl:max-w-[180px]">
                  <div><dt className="text-xs text-muted-foreground">Requested</dt><dd className="mt-1 text-xl font-bold tabular-nums">{formatNumber(request.totalRequested)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Approved</dt><dd className="mt-1 text-xl font-bold tabular-nums text-green-700 dark:text-green-400">{formatNumber(request.totalApproved)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Items</dt><dd className="mt-1 text-xl font-bold tabular-nums">{request.items.length}</dd></div>
                </dl>
              </div>
              <div className="mt-4 overflow-hidden rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead scope="col">Request item</TableHead><TableHead scope="col" className="text-right">Requested</TableHead><TableHead scope="col" className="text-right">Approved</TableHead></TableRow></TableHeader>
                  <TableBody>{request.items.map((item, index) => <TableRow key={item.id}><TableCell className="category-flash font-bold text-destructive">{item.ticketCategory?.displayName ?? `Request item ${index + 1}`}</TableCell><TableCell className="text-right tabular-nums">{item.requestedQuantity}</TableCell><TableCell className="text-right font-medium tabular-nums">{item.approvedQuantity}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              {actionable && (
                <div className="mt-4 flex flex-wrap gap-2" aria-label={`Decide ${request.requestNumber}`}>
                  {step.quickApproval && <Button size="sm" disabled={saving} onClick={() => void approveFull(step)}>Approve full ({request.totalRequested})</Button>}
                  <Button size="sm" onClick={() => openDecision(step, "APPROVE")}><Check className="mr-2 h-4 w-4" />{step.quickApproval ? "Review request" : "Approve"}</Button>
                  {step.stepDefinition.allowPartialApproval && <Button size="sm" variant="outline" onClick={() => openDecision(step, "PARTIAL")}><Split className="mr-2 h-4 w-4" />Partial</Button>}
                  {step.stepDefinition.allowReturnForClarification && <Button size="sm" variant="outline" onClick={() => openDecision(step, "RETURN")}><ArrowUp className="mr-2 h-4 w-4" />Return</Button>}
                  <Button size="sm" variant="destructive" onClick={() => openDecision(step, "REJECT")}><X className="mr-2 h-4 w-4" />Reject</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      <ApprovalDecisionDialog step={selected} action={action} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }} onDecided={onDecided} />
    </div>
  )
}
