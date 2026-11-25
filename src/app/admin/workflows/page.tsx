"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, GitBranch, Pencil, Plus, Trash2 } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect } from "@/components/operations/list-controls"
import { useToast } from "@/hooks/use-toast"

interface WorkflowStep {
  id: string
  stepOrder: number
  name: string
  description: string | null
  approverRoleId: string | null
  approverUserId: string | null
  approverRole: { id: string; name: string; displayName: string } | null
  minQuantity: number
  maxQuantity: number | null
  allowPartialApproval: boolean
  allowReturnForClarification: boolean
  allowEscalation: boolean
  timeoutHours: number | null
  isActive: boolean
}
interface Workflow {
  id: string
  matchId: string
  name: string
  description: string | null
  isDefault: boolean
  isActive: boolean
  steps: WorkflowStep[]
}
interface MatchOption { id: string; title: string }
interface RoleOption { id: string; displayName: string }

interface EditableStep {
  name: string
  approverRoleId: string
  minQuantity: string
  maxQuantity: string
  timeoutHours: string
  allowPartialApproval: boolean
  allowReturnForClarification: boolean
}

const emptyStep: EditableStep = { name: "", approverRoleId: "", minQuantity: "0", maxQuantity: "", timeoutHours: "48", allowPartialApproval: true, allowReturnForClarification: true }

export default function ApprovalWorkflowsPage() {
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()
  const [matchId, setMatchId] = React.useState("")
  const [matches, setMatches] = React.useState<MatchOption[]>([])
  const [roles, setRoles] = React.useState<RoleOption[]>([])
  const [workflows, setWorkflows] = React.useState<Workflow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editingWorkflow, setEditingWorkflow] = React.useState<Workflow | null>(null)
  const [form, setForm] = React.useState({ name: "", description: "" })
  const [steps, setSteps] = React.useState<EditableStep[]>([{ ...emptyStep }])
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState("")
  const [deleting, setDeleting] = React.useState<Workflow | null>(null)
  const canRead = Boolean(user?.permissions.includes("approvals:read"))
  const canConfigure = Boolean(user?.permissions.includes("approvals:configure"))
  const canDelete = Boolean(user?.roles?.includes("SUPER_ADMIN"))

  React.useEffect(() => {
    if (!canRead) return
    Promise.all([
      fetch("/api/matches?limit=100", { cache: "no-store" }).then((r) => r.json()) as Promise<{ matches?: MatchOption[] }>,
      fetch("/api/admin/roles", { cache: "no-store" }).then((r) => r.json()) as Promise<{ roles?: RoleOption[] }>,
    ]).then(([matchBody, roleBody]) => {
      setMatches(matchBody.matches || [])
      setRoles(roleBody.roles || [])
    }).catch(() => setError("Unable to load matches or roles"))
  }, [canRead])

  const loadWorkflows = React.useCallback((selected: string) => {
    if (!selected) { setWorkflows([]); return }
    setLoading(true)
    setError("")
    fetch(`/api/approval-workflows?matchId=${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { workflows?: Workflow[]; error?: string }
        if (!response.ok) throw new Error(body.error || "Unable to load workflows")
        setWorkflows(body.workflows || [])
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load workflows"))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { if (!sessionLoading && matchId) loadWorkflows(matchId) }, [matchId, sessionLoading, loadWorkflows])

  function openEditor() {
    setEditingWorkflow(null)
    setForm({ name: "Standard Approval", description: "" })
    setSteps([{ ...emptyStep }])
    setFormError("")
    setEditorOpen(true)
  }

  function openEditEditor(workflow: Workflow) {
    setEditingWorkflow(workflow)
    setForm({ name: workflow.name, description: workflow.description || "" })
    setSteps(workflow.steps.map((step) => ({
      name: step.name,
      approverRoleId: step.approverRoleId || "",
      minQuantity: String(step.minQuantity),
      maxQuantity: step.maxQuantity === null ? "" : String(step.maxQuantity),
      timeoutHours: step.timeoutHours === null ? "" : String(step.timeoutHours),
      allowPartialApproval: step.allowPartialApproval,
      allowReturnForClarification: step.allowReturnForClarification,
    })))
    setFormError("")
    setEditorOpen(true)
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = steps.slice()
    next[index] = steps[target]
    next[target] = steps[index]
    setSteps(next)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!matchId) { setFormError("Select a match first"); return }
    setSaving(true)
    setFormError("")
    try {
      const stepPayload = steps.map((step, index) => ({
        stepOrder: index + 1, name: step.name,
        approverRoleId: step.approverRoleId || null, approverUserId: null,
        minQuantity: Number(step.minQuantity || 0),
        maxQuantity: step.maxQuantity === "" ? null : Number(step.maxQuantity),
        timeoutHours: step.timeoutHours === "" ? null : Number(step.timeoutHours),
        allowPartialApproval: step.allowPartialApproval,
        allowReturnForClarification: step.allowReturnForClarification,
        allowEscalation: true, isActive: true,
      }))
      const target = editingWorkflow
      const isEdit = target !== null
      const response = await fetch(isEdit ? `/api/approval-workflows/${encodeURIComponent(target.id)}` : "/api/approval-workflows", {
        method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit
          ? { name: form.name, description: form.description || null, steps: stepPayload }
          : { matchId, name: form.name, description: form.description || null, isDefault: true, steps: stepPayload }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to save workflow")
      toast({
        title: isEdit ? "Workflow updated" : "Workflow created",
        description: `${form.name} with ${steps.length} step${steps.length === 1 ? "" : "s"}.`,
      })
      setEditorOpen(false)
      setEditingWorkflow(null)
      loadWorkflows(matchId)
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save workflow")
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setSaving(true)
    try {
      const response = await fetch(`/api/approval-workflows/${encodeURIComponent(deleting.id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to delete workflow")
      toast({ title: "Workflow deleted", description: deleting.name })
      setDeleting(null)
      loadWorkflows(matchId)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to delete workflow")
    } finally {
      setSaving(false)
    }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader
      eyebrow="Operations"
      title="Approval workflows"
      description="Sequential approval steps applied to requests submitted for a match. Requests snapshot the default workflow when submitted."
      onRefresh={matchId ? () => loadWorkflows(matchId) : undefined}
      refreshing={loading}
      actions={canConfigure ? <Button size="sm" onClick={openEditor} disabled={!matchId}><Plus className="mr-2 h-4 w-4" />New workflow</Button> : undefined}
    />
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <Card className="shadow-none"><CardContent className="p-4">
      <FilterSelect value={matchId} onChange={(value) => setMatchId(value)} label="Match" options={[{ value: "", label: "Select a match" }, ...matches.map((match) => ({ value: match.id, label: match.title }))]} />
    </CardContent></Card>

    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view approval workflows.</p>
      : matchId ? <DataState loading={loading} error={error} onRetry={() => loadWorkflows(matchId)} skeleton={<Card><TableSkeleton /></Card>}>
        {workflows.length === 0
          ? <Card><EmptyState icon={<GitBranch className="h-10 w-10" />} title="No workflows for this match" description="Submitting a request will auto-create a default single-step workflow unless one is defined here." /></Card>
          : <div className="grid gap-4 xl:grid-cols-2">{workflows.map((workflow) => <Card key={workflow.id} className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">{workflow.name}{workflow.isDefault && <Badge variant="secondary">Default</Badge>}{!workflow.isActive && <Badge variant="outline">Inactive</Badge>}</span>
                <span className="flex gap-1">
                  {canConfigure && <Button variant="ghost" size="icon" aria-label={`Edit workflow ${workflow.name}`} onClick={() => openEditEditor(workflow)}><Pencil className="h-4 w-4" /></Button>}
                  {canDelete && <Button variant="ghost" size="icon" aria-label={`Delete workflow ${workflow.name}`} onClick={() => setDeleting(workflow)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </span>
              </CardTitle>
              <CardDescription>{workflow.steps.length} step{workflow.steps.length === 1 ? "" : "s"} · applied to new submissions</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {workflow.steps.map((step) => <li key={step.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{step.stepOrder}. {step.name}</span>
                    <Badge variant="outline">{step.approverRole?.displayName || "Specific user"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.minQuantity > 0 || step.maxQuantity ? `Quantity ${step.minQuantity}${step.maxQuantity ? `–${step.maxQuantity}` : "+"} · ` : ""}
                    {step.timeoutHours ? `Timeout ${step.timeoutHours}h · ` : ""}
                    {step.allowPartialApproval ? "Partial allowed" : "All-or-nothing"}
                    {step.allowReturnForClarification ? " · Return allowed" : ""}
                  </p>
                </li>)}
              </ol>
            </CardContent>
          </Card>)}</div>}
      </DataState>
      : <Card><EmptyState icon={<GitBranch className="h-10 w-10" />} title="Select a match" description="Choose a match to view and configure its approval workflows." /></Card>}

    <Dialog open={editorOpen} onOpenChange={(open) => { if (!saving) { setEditorOpen(open); if (!open) setEditingWorkflow(null) } }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{editingWorkflow ? "Edit approval workflow" : "New approval workflow"}</DialogTitle><DialogDescription>{editingWorkflow ? "Update the workflow's details or reorder and edit its steps. Workflows with in-flight approvals cannot have their steps replaced." : "Define the sequential steps a request passes through after submission for the selected match."}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="workflow-name">Name</Label><Input id="workflow-name" required minLength={2} maxLength={150} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={saving} /></div>
          <div className="space-y-2"><Label htmlFor="workflow-description">Description</Label><Input id="workflow-description" maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} disabled={saving} /></div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Steps (executed in order)</p>
          {steps.map((step, index) => <div key={index} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Step {index + 1}</p>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${index + 1} up`} disabled={index === 0 || saving} onClick={() => moveStep(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1 || saving} onClick={() => moveStep(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                {steps.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps(steps.filter((_, position) => position !== index))}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Step name</Label><Input required minLength={2} maxLength={150} placeholder="e.g. Secretary approval" value={step.name} onChange={(event) => setSteps(steps.map((current, position) => position === index ? { ...current, name: event.target.value } : current))} disabled={saving} /></div>
              <div className="space-y-2"><Label>Approver role</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required value={step.approverRoleId} onChange={(event) => setSteps(steps.map((current, position) => position === index ? { ...current, approverRoleId: event.target.value } : current))} disabled={saving}><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}</select></div>
              <div className="space-y-2"><Label>Min quantity</Label><Input type="number" min={0} value={step.minQuantity} onChange={(event) => setSteps(steps.map((current, position) => position === index ? { ...current, minQuantity: event.target.value } : current))} disabled={saving} /></div>
              <div className="space-y-2"><Label>Max quantity</Label><Input type="number" min={0} placeholder="No limit" value={step.maxQuantity} onChange={(event) => setSteps(steps.map((current, position) => position === index ? { ...current, maxQuantity: event.target.value } : current))} disabled={saving} /></div>
              <div className="space-y-2"><Label>Timeout (hours)</Label><Input type="number" min={1} value={step.timeoutHours} onChange={(event) => setSteps(steps.map((current, position) => position === index ? { ...current, timeoutHours: event.target.value } : current))} disabled={saving} /></div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={step.allowPartialApproval} onChange={(event) => setSteps(steps.map((current, position) => position === index ? { ...current, allowPartialApproval: event.target.checked } : current))} />Allow partial approval</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={step.allowReturnForClarification} onChange={(event) => setSteps(steps.map((current, position) => position === index ? { ...current, allowReturnForClarification: event.target.checked } : current))} />Allow return for clarification</label>
            </div>
          </div>)}
          <Button type="button" variant="outline" size="sm" onClick={() => setSteps([...steps, { ...emptyStep }])}><Plus className="mr-2 h-4 w-4" />Add step</Button>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editingWorkflow ? "Save changes" : "Create workflow"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>

    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>Delete workflow</DialogTitle><DialogDescription>Delete “{deleting?.name}”? Workflows used by in-flight approval steps cannot be deleted.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)} disabled={saving}>Cancel</Button><Button variant="destructive" onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Delete workflow"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div></MainLayout>
}
