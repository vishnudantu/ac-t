"use client"

import * as React from "react"
import { BarChart3, Package, Shield, Ticket, Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { downloadExport } from "@/components/operations/api"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { selectClassName } from "@/components/lifecycle/client"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, MetricSkeleton, TableSkeleton } from "@/components/operations/data-state"
import { MetricCard } from "@/components/operations/metric-card"
import { formatNumber } from "@/lib/utils"

interface ReportData {
  matches: { id: string; title: string; matchDate: string; status: string }[]
  summary: { requests: number; requested: number; approved: number; allocated: number; issued: number; delivered: number; inventory: number; available: number; quotaAllocated: number; quotaConsumed: number; allocationRecords: number; issuanceRecords: number; purposeBreakdown?: Record<string, { pools: number; issued: number; value: number }>; complimentarySetoffPerTicket?: number }
  categories: { id: string; name: string; requested: number; approved: number; allocated: number; issued: number; available: number }[]
}

export default function ReportsPage() {
  const { user, loading: sessionLoading } = useSession()
  const [matchId, setMatchId] = React.useState("")
  const [data, setData] = React.useState<ReportData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const canRead = Boolean(user?.permissions.includes("reports:read"))
  const canExport = Boolean(user?.permissions.includes("reports:export"))
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch(`/api/reports${matchId ? `?matchId=${encodeURIComponent(matchId)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json()
        if (!response.ok) throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Unable to load reports")
        setData(body as ReportData)
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load reports") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [matchId, canRead, sessionLoading, attempt])

  async function exportReport(format: "CSV" | "XLSX") {
    setExporting(true)
    setExportError("")
    try {
      await downloadExport({ type: "REPORTS", format, matchId: matchId || undefined })
    } catch (cause: unknown) {
      setExportError(cause instanceof Error ? cause.message : "Unable to export the report")
    } finally {
      setExporting(false)
    }
  }

  const summary = data?.summary
  const exportData = data && summary ? {
    generatedAt: new Date().toLocaleString('en-IN'),
    matchTitle: matchId ? data.matches.find((match) => match.id === matchId)?.title || 'Selected match' : 'All matches',
    summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()), value])),
    categories: data.categories,
  } : null
  return <MainLayout><div className="space-y-5">
    <PageHeader title="Reports & analytics" description="Operational totals and category fulfilment from the database." onRefresh={() => setAttempt((value) => value + 1)} refreshing={loading} actions={exportData ? <>
      {canExport && <><Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportReport("CSV")}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
      <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportReport("XLSX")}><Download className="mr-2 h-4 w-4" />Export Excel</Button></>}
      <Button size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
    </> : undefined} />
    {exportError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{exportError}</p>}
    <div className="hidden print:block"><h1 className="text-xl font-bold">ACA TicketOps — operational report</h1><p className="text-sm">Generated {exportData?.generatedAt} · {exportData?.matchTitle}</p></div>
    <div className="max-w-sm"><label htmlFor="report-match" className="mb-2 block text-sm font-medium">Match</label><select id="report-match" className={selectClassName} value={matchId} onChange={(event) => setMatchId(event.target.value)}><option value="">All matches</option>{data?.matches.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</select></div>
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view reports.</p> : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<MetricSkeleton />}>
      {summary && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operational totals">
          <MetricCard label="Ticket requests" value={summary.requests} icon={BarChart3} description={`${formatNumber(summary.requested)} tickets requested`} />
          <MetricCard label="Approved" value={summary.approved} icon={Ticket} description={`${formatNumber(summary.allocated)} allocated · ${formatNumber(summary.issued)} issued`} />
          <MetricCard label="Available inventory" value={summary.available} icon={Package} description={`${formatNumber(summary.inventory)} total tickets`} />
          <MetricCard label="Quota utilization" value={summary.quotaAllocated ? `${Math.round(summary.quotaConsumed / summary.quotaAllocated * 100)}%` : "—"} icon={Shield} description={`${formatNumber(summary.quotaConsumed)} of ${formatNumber(summary.quotaAllocated)} tickets`} />
        </section>
        <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Category fulfilment</CardTitle></CardHeader><CardContent className="p-0">
          {data.categories.length === 0 ? <EmptyState icon={<BarChart3 className="h-10 w-10" />} title="No category data" description="Categories will appear after a match and its inventory are configured." /> : <Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Requested</TableHead><TableHead className="text-right">Approved</TableHead><TableHead className="text-right">Allocated</TableHead><TableHead className="text-right">Issued</TableHead><TableHead className="text-right">Available</TableHead></TableRow></TableHeader><TableBody>{data.categories.map((category) => <TableRow key={category.id}><TableCell><Badge variant="secondary">{category.name}</Badge></TableCell><TableCell className="text-right">{formatNumber(category.requested)}</TableCell><TableCell className="text-right">{formatNumber(category.approved)}</TableCell><TableCell className="text-right">{formatNumber(category.allocated)}</TableCell><TableCell className="text-right">{formatNumber(category.issued)}</TableCell><TableCell className="text-right">{formatNumber(category.available)}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent></Card>
        {data.summary.purposeBreakdown && Object.keys(data.summary.purposeBreakdown).length > 0 && <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Complimentary set-off & purchase revenue</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Purpose</TableHead><TableHead className="text-right">Pools</TableHead><TableHead className="text-right">Issued</TableHead><TableHead className="text-right">Value (₹)</TableHead></TableRow></TableHeader><TableBody>{Object.entries(data.summary.purposeBreakdown).map(([purpose, bucket]) => <TableRow key={purpose}><TableCell><Badge variant={purpose === 'COMPLIMENTARY' ? 'secondary' : 'default'}>{purpose === 'COMPLIMENTARY' ? 'Complimentary (GST set-off)' : 'Purchase'}</Badge></TableCell><TableCell className="text-right">{formatNumber(bucket.pools)}</TableCell><TableCell className="text-right">{formatNumber(bucket.issued)}</TableCell><TableCell className="text-right font-bold tabular-nums">{formatNumber(Math.round(bucket.value))}</TableCell></TableRow>)}</TableBody></Table><p className="p-3 text-xs text-muted-foreground">Complimentary value uses each pool&apos;s face value (default set-off ₹{data.summary.complimentarySetoffPerTicket ?? 499} per ticket when not set). Purchase value is face value × issued.</p></CardContent></Card>}
        <p className="text-xs text-muted-foreground">Counts reflect the selected match. CSV and Excel exports are generated from current database values.</p>
      </>}
    </DataState>}
  </div></MainLayout>
}
