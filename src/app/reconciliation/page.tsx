"use client"

import * as React from "react"
import { Scale } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect } from "@/components/operations/list-controls"
import { formatDate, formatNumber, getStatusColor } from "@/lib/utils"

interface ReconciliationRow {
  id: string
  title: string
  matchDate: string
  venue: string
  status: string
  totals: { requested: number; approved: number; allocated: number; issued: number }
  inventory: { total: number; available: number; allocated: number; issued: number; returned: number; void: number }
  quota: { allocated: number; consumed: number }
  requestsByStatus: Record<string, number>
  reconciliation: { unapproved: number; unallocated: number; unissued: number; remainingStock: number }
}

export default function ReconciliationPage() {
  const { user, loading: sessionLoading } = useSession()
  const [rows, setRows] = React.useState<ReconciliationRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [matchId, setMatchId] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)
  const canRead = Boolean(user?.permissions.includes("reports:read"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch(`/api/reconciliation${matchId ? `?matchId=${encodeURIComponent(matchId)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { matches?: ReconciliationRow[]; error?: string }
        if (!response.ok) throw new Error(body.error || "Unable to load reconciliation")
        setRows(body.matches || [])
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load reconciliation") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, sessionLoading, matchId, attempt])

  return <MainLayout><div className="space-y-5">
    <PageHeader
      title="Reconciliation"
      description="Requested vs approved vs allocated vs issued per match, with remaining stock and open quantities."
      onRefresh={() => setAttempt((value) => value + 1)}
      refreshing={loading}
    />
    <Card className="shadow-none"><CardContent className="p-4">
      <FilterSelect value={matchId} onChange={setMatchId} label="Match" options={[{ value: "", label: "All matches" }, ...rows.map((row) => ({ value: row.id, label: row.title }))]} />
    </CardContent></Card>
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view reconciliation.</p>
      : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
        {rows.length === 0 ? <Card><EmptyState icon={<Scale className="h-10 w-10" />} title="No matches to reconcile" description="Reconciliation will appear after requests and inventory are created." /></Card>
          : rows.map((row) => <Card key={row.id} className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">{row.title}<Badge className={getStatusColor(row.status)}>{row.status}</Badge></CardTitle>
              <p className="text-xs text-muted-foreground">{formatDate(row.matchDate)} · {row.venue}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader><TableRow><TableHead>Requested</TableHead><TableHead>Approved</TableHead><TableHead>Allocated</TableHead><TableHead>Issued</TableHead><TableHead>Unapproved</TableHead><TableHead>Unallocated</TableHead><TableHead>Unissued</TableHead></TableRow></TableHeader>
                <TableBody><TableRow>
                  <TableCell>{formatNumber(row.totals.requested)}</TableCell>
                  <TableCell>{formatNumber(row.totals.approved)}</TableCell>
                  <TableCell>{formatNumber(row.totals.allocated)}</TableCell>
                  <TableCell>{formatNumber(row.totals.issued)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatNumber(row.reconciliation.unapproved)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatNumber(row.reconciliation.unallocated)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatNumber(row.reconciliation.unissued)}</TableCell>
                </TableRow></TableBody>
              </Table>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Inventory total</p><p className="mt-1 text-lg font-bold tabular-nums">{formatNumber(row.inventory.total)}</p></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Available now</p><p className="mt-1 text-lg font-bold tabular-nums">{formatNumber(row.inventory.available)}</p></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Remaining stock (after issued/void)</p><p className="mt-1 text-lg font-bold tabular-nums">{formatNumber(row.reconciliation.remainingStock)}</p></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Quota consumed</p><p className="mt-1 text-lg font-bold tabular-nums">{formatNumber(row.quota.consumed)} / {formatNumber(row.quota.allocated)}</p></div>
              </div>
              <p className="text-xs text-muted-foreground">{Object.entries(row.requestsByStatus).map(([status, count]) => `${status.toLowerCase().replace('_', ' ')}: ${count}`).join(' · ') || 'No requests yet'}</p>
            </CardContent>
          </Card>)}
      </DataState>}
  </div></MainLayout>
}
