"use client"

import * as React from "react"
import { Database } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination, SearchInput } from "@/components/operations/list-controls"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDateTime, formatStatus } from "@/lib/utils"

interface AuditEvent {
  id: string
  eventId: string
  entityType: string
  entityId: string
  action: string
  oldValues: string | null
  newValues: string | null
  reason: string | null
  createdAt: string
  user: { fullName: string; email: string } | null
  match: { title: string } | null
}

export default function AuditPage() {
  const { user, loading: sessionLoading } = useSession()
  const [events, setEvents] = React.useState<AuditEvent[]>([])
  const [total, setTotal] = React.useState(0)
  const [search, setSearch] = React.useState("")
  const [action, setAction] = React.useState("all")
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<AuditEvent | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)
  const canRead = Boolean(user?.permissions.includes("audit:read"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError("")
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "50", offset: String((page - 1) * 50), action })
        if (search.trim()) params.set("search", search.trim())
        const response = await fetch(`/api/audit?${params}`, { cache: "no-store", signal: controller.signal })
        const body = await response.json() as { events?: AuditEvent[]; total?: number; error?: string }
        if (!response.ok) throw new Error(body.error || "Unable to load audit logs")
        setEvents(body.events || [])
        setTotal(body.total || 0)
      } catch (cause: unknown) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load audit logs")
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, 200)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [action, search, page, canRead, sessionLoading, attempt])

  return <MainLayout><div className="space-y-5">
    <PageHeader title="Audit logs" description="Recorded changes to requests, approvals, allocations, and administration." onRefresh={() => setAttempt((value) => value + 1)} refreshing={loading} />
    <Card className="shadow-none"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} label="Search audit events" placeholder="Search by event, entity, or user…" /><FilterSelect value={action} onChange={(value) => { setAction(value); setPage(1) }} label="Action" options={[{ value: "all", label: "All actions" }, ...["CREATE", "SUBMIT", "UPDATE", "DELETE", "APPROVE", "PARTIAL", "REJECT", "RETURN", "CONFIRM", "ISSUE"].map((value) => ({ value, label: formatStatus(value) }))]} /></CardContent></Card>
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view audit logs.</p> : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
      {events.length === 0 ? <Card><EmptyState icon={<Database className="h-10 w-10" />} title="No audit events found" description="Events will appear when material operations are recorded." /></Card> : <Card className="shadow-none"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Match</TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={event.id} className="cursor-pointer" onClick={() => setSelected(event)}><TableCell className="whitespace-nowrap text-xs">{formatDateTime(event.createdAt)}</TableCell><TableCell>{event.user?.fullName || "System"}<div className="text-xs text-muted-foreground">{event.user?.email || ""}</div></TableCell><TableCell><Badge variant="secondary">{formatStatus(event.action)}</Badge></TableCell><TableCell><button type="button" className="text-left text-primary hover:underline" onClick={() => setSelected(event)}>{event.entityType}<span className="block font-mono text-xs text-muted-foreground">{event.entityId}</span></button></TableCell><TableCell className="text-sm">{event.match?.title || "—"}</TableCell></TableRow>)}</TableBody></Table></Card>}
      <div className="rounded-lg border bg-card"><Pagination page={page} pageSize={50} total={total} itemCount={events.length} onPageChange={setPage} /></div>
    </DataState>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{selected?.action} · {selected?.entityType}</DialogTitle><DialogDescription>{selected?.eventId} · {selected && formatDateTime(selected.createdAt)}</DialogDescription></DialogHeader><div className="grid gap-4 text-sm sm:grid-cols-2"><div><h3 className="mb-2 font-medium">Previous values</h3><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{selected?.oldValues || "None"}</pre></div><div><h3 className="mb-2 font-medium">New values</h3><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{selected?.newValues || "None"}</pre></div></div></DialogContent></Dialog>
  </div></MainLayout>
}
