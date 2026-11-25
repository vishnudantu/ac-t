"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Quota } from "@/components/operations/types"

interface Template {
  id: string
  name: string
  displayName: string
  description: string | null
}

interface Allocation {
  ticketCategoryId: string
  allocatedQuantity: string
}

interface QuotaEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quota: Quota | null
  matches: { id: string; title: string }[]
  onSaved: () => void
}

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"

export function QuotaEditor({ open, onOpenChange, quota, matches, onSaved }: QuotaEditorProps) {
  const [templates, setTemplates] = React.useState<Template[]>([])
  const [categories, setCategories] = React.useState<{ id: string; displayName: string }[]>([])
  const [matchId, setMatchId] = React.useState("")
  const [templateId, setTemplateId] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [isActive, setIsActive] = React.useState(true)
  const [allocations, setAllocations] = React.useState<Allocation[]>([])
  const [newTemplateName, setNewTemplateName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setError("")
    setSaving(false)
    fetch("/api/quota-templates", { cache: "no-store" }).then((response) => response.json()).then((body: { templates?: Template[] }) => setTemplates(body.templates || [])).catch(() => setError("Unable to load quota templates"))
    if (quota) {
      setMatchId(quota.match.id)
      setTemplateId("")
      setDisplayName(quota.displayName)
      setDescription("")
      setIsActive(quota.isActive)
      setAllocations(quota.quotaAllocations.map((item) => ({ ticketCategoryId: item.ticketCategory.id, allocatedQuantity: String(item.allocatedQuantity) })))
    } else {
      setMatchId("")
      setTemplateId("")
      setDisplayName("")
      setDescription("")
      setIsActive(true)
      setAllocations([])
    }
    setNewTemplateName("")
  }, [open, quota])

  React.useEffect(() => {
    if (!matchId) { setCategories([]); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/matches/${encodeURIComponent(matchId)}/categories`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { categories?: { id: string; displayName: string }[] }) => { if (!cancelled) setCategories(body.categories || []) })
      .catch(() => { if (!cancelled) setError("Unable to load ticket categories") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [matchId])

  async function createTemplate() {
    if (!newTemplateName.trim()) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/quota-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTemplateName, displayName: newTemplateName }),
      })
      const body = await response.json() as { error?: string; template?: Template }
      if (!response.ok || !body.template) throw new Error(body.error || "Unable to create template")
      setTemplates((current) => [...current, body.template!].sort((a, b) => a.displayName.localeCompare(b.displayName)))
      selectTemplate(body.template)
      setNewTemplateName("")
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to create template") } finally { setSaving(false) }
  }

  function selectTemplate(template: Template) {
    setTemplateId(template.id)
    setDisplayName(template.displayName)
    setDescription(template.description || "")
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!matchId || !displayName.trim()) { setError("Select a match and quota template"); return }
    setSaving(true)
    setError("")
    try {
      const template = templates.find((item) => item.id === templateId)
      const payload = {
        matchId, displayName, description: description || null, isActive,
        allocations: allocations.filter((item) => item.ticketCategoryId && Number(item.allocatedQuantity) > 0).map((item) => ({ ticketCategoryId: item.ticketCategoryId, allocatedQuantity: Number(item.allocatedQuantity) })),
        ...(quota ? {} : { name: template?.name || displayName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") }),
      }
      const response = await fetch(quota ? `/api/quotas/${encodeURIComponent(quota.id)}` : "/api/quotas", {
        method: quota ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to save quota")
      onOpenChange(false)
      onSaved()
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to save quota") } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{quota ? "Edit quota pool" : "New quota pool"}</DialogTitle><DialogDescription>{quota ? `Update “${quota.displayName}” and its category allocations.` : "Choose a stakeholder group, match and category allocations. Capacity is validated on save."}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="space-y-2"><Label htmlFor="quota-match">Match</Label><select id="quota-match" className={selectClass} required value={matchId} onChange={(event) => setMatchId(event.target.value)} disabled={Boolean(quota) || saving}><option value="">Select match</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</select></div>
        {!quota && <>
          <div className="space-y-2"><Label htmlFor="quota-template">Stakeholder template</Label><select id="quota-template" className={selectClass} required value={templateId} onChange={(event) => { const template = templates.find((item) => item.id === event.target.value); if (template) selectTemplate(template) }} disabled={saving}><option value="">Select stakeholder group</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.displayName}</option>)}</select></div>
          <div className="flex items-end gap-2"><div className="flex-1 space-y-2"><Label htmlFor="new-template">Or create a new stakeholder</Label><Input id="new-template" placeholder="e.g. Ground Staff Allocation" value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} disabled={saving} /></div><Button type="button" variant="outline" onClick={createTemplate} disabled={saving || !newTemplateName.trim()}><Plus className="mr-1 h-4 w-4" />Add template</Button></div>
        </>}
        <div className="space-y-2"><Label htmlFor="quota-display">Display name</Label><Input id="quota-display" required minLength={2} maxLength={500} value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={saving} /></div>
        <div className="space-y-2"><Label htmlFor="quota-description">Description</Label><Input id="quota-description" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} /></div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm font-medium">Category allocations</p><Button type="button" variant="outline" size="sm" onClick={() => setAllocations([...allocations, { ticketCategoryId: "", allocatedQuantity: "0" }])} disabled={saving || !matchId}><Plus className="mr-1 h-3.5 w-3.5" />Add category</Button></div>
          {loading && <p className="text-sm text-muted-foreground">Loading categories…</p>}
          {allocations.length === 0 && <p className="text-xs text-muted-foreground">Add each category this stakeholder can draw from.</p>}
          {allocations.map((allocation, index) => <div key={index} className="grid grid-cols-[1fr_100px_36px] items-end gap-2">
            <select className={selectClass} aria-label={`Category ${index + 1}`} required value={allocation.ticketCategoryId} onChange={(event) => setAllocations(allocations.map((current, position) => position === index ? { ...current, ticketCategoryId: event.target.value } : current))} disabled={saving}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.displayName}</option>)}</select>
            <Input aria-label={`Quantity ${index + 1}`} type="number" min={1} required value={allocation.allocatedQuantity} onChange={(event) => setAllocations(allocations.map((current, position) => position === index ? { ...current, allocatedQuantity: event.target.value } : current))} disabled={saving} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove allocation" onClick={() => setAllocations(allocations.filter((_, position) => position !== index))} disabled={saving}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
        </div>
        {quota && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} disabled={saving} />Active (available for new requests and allocations)</label>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : quota ? "Save changes" : "Create quota"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
