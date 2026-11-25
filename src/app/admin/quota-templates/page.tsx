"use client"

import * as React from "react"
import { Layers3, Pencil, Plus, Trash2 } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { useToast } from "@/hooks/use-toast"

interface Template {
  id: string
  name: string
  displayName: string
  description: string | null
  isActive: boolean
}

const emptyForm = { name: "", displayName: "", description: "" }

export default function QuotaTemplatesPage() {
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Template | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState("")
  const [deleting, setDeleting] = React.useState<Template | null>(null)
  const canRead = Boolean(user?.permissions.includes("quotas:read"))
  const canWrite = Boolean(user?.permissions.includes("quotas:write"))
  const canDelete = Boolean(user?.roles?.includes("SUPER_ADMIN"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch("/api/quota-templates", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { templates?: Template[]; error?: string }
        if (!response.ok) throw new Error(body.error || "Unable to load quota templates")
        setTemplates(body.templates || [])
        setError("")
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load quota templates") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, sessionLoading, attempt])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError("")
    setDialogOpen(true)
  }

  function openEdit(template: Template) {
    setEditing(template)
    setForm({ name: template.name, displayName: template.displayName, description: template.description || "" })
    setFormError("")
    setDialogOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError("")
    try {
      const response = await fetch(editing ? `/api/quota-templates/${encodeURIComponent(editing.id)}` : "/api/quota-templates", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing
          ? { displayName: form.displayName, description: form.description || null }
          : { name: form.name, displayName: form.displayName, description: form.description || null }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to save quota template")
      toast({ title: editing ? "Template updated" : "Template created", description: form.displayName })
      setDialogOpen(false)
      setAttempt((value) => value + 1)
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save quota template")
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setSaving(true)
    try {
      const response = await fetch(`/api/quota-templates/${encodeURIComponent(deleting.id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to delete quota template")
      toast({ title: "Template deleted", description: deleting.displayName })
      setDeleting(null)
      setAttempt((value) => value + 1)
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : "Unable to delete quota template")
    } finally {
      setSaving(false)
    }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader
      title="Quota templates"
      description="Reusable stakeholder quota groups applied when creating match quotas."
      onRefresh={() => setAttempt((value) => value + 1)}
      refreshing={loading}
      actions={canWrite ? <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New template</Button> : undefined}
    />
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view quota templates.</p>
      : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
        {templates.length === 0
          ? <Card><EmptyState icon={<Layers3 className="h-10 w-10" />} title="No quota templates" description="Create stakeholder groups such as Apex Allocation or BCCI Allocation to reuse across matches." /></Card>
          : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <Card key={template.id} className="shadow-none">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-start justify-between gap-2 text-base"><span>{template.displayName}</span>
                <span className="flex shrink-0 gap-1">
                  {canWrite && <Button variant="ghost" size="icon" aria-label={`Edit ${template.displayName}`} onClick={() => openEdit(template)}><Pencil className="h-4 w-4" /></Button>}
                  {canDelete && <Button variant="ghost" size="icon" aria-label={`Delete ${template.displayName}`} onClick={() => setDeleting(template)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </span></CardTitle>
              <p className="font-mono text-xs text-muted-foreground">{template.name}</p>
            </CardHeader>
            <CardContent className="p-4 pt-0"><p className="text-sm text-muted-foreground">{template.description || "No description."}</p></CardContent>
          </Card>)}</div>}
      </DataState>}

    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open) }}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit quota template" : "New quota template"}</DialogTitle><DialogDescription>Templates are reusable stakeholder groups. The code is generated from the display name when creating.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
        {!editing && <div className="space-y-2"><Label htmlFor="template-code">Code (optional — generated from display name if blank)</Label><Input id="template-code" maxLength={100} placeholder="APEX_ALLOCATION" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value.toUpperCase() })} disabled={saving} /></div>}
        <div className="space-y-2"><Label htmlFor="template-display">Display name</Label><Input id="template-display" required minLength={2} maxLength={150} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} disabled={saving} /></div>
        <div className="space-y-2"><Label htmlFor="template-desc">Description</Label><Input id="template-desc" maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} disabled={saving} /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create template"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>

    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(null) }}><DialogContent>
      <DialogHeader><DialogTitle>Delete quota template</DialogTitle><DialogDescription>Delete {deleting?.displayName}? Templates used by match quotas cannot be deleted — deactivate instead.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)} disabled={saving}>Cancel</Button><Button variant="destructive" onClick={confirmDelete} disabled={saving}>{saving ? "Deleting…" : "Delete template"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div></MainLayout>
}
