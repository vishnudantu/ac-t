"use client"

import * as React from "react"
import { IndianRupee, Ticket, TrendingUp } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { MetricCard } from "@/components/operations/metric-card"
import { FilterSelect } from "@/components/operations/list-controls"
import { formatNumber, formatCurrency } from "@/lib/utils"

interface RevenueRow {
  purpose: string
  matchTitle: string
  category: string
  complimentaryIssued: number
  saleIssued: number
  complimentaryRevenue: number
  saleRevenue: number
  gstOnComplimentary: number
  gstOnSale: number
}
interface RevenueData {
  gstRatePercent: number
  nominalComplimentaryPrice: number
  totals: {
    complimentaryIssued: number; saleIssued: number; complimentaryRevenue: number; saleRevenue: number
    gstOnComplimentary: number; gstOnSale: number
    totalIssued: number; totalRevenue: number; gstTotal: number; netOfGst: number
    pendingApproved?: number; pendingAllocated?: number
  }
  rows: RevenueRow[]
}

export default function RevenuePage() {
  const { user, loading: sessionLoading } = useSession()
  const [data, setData] = React.useState<RevenueData | null>(null)
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
    fetch(`/api/revenue${matchId ? `?matchId=${encodeURIComponent(matchId)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as RevenueData & { error?: string }
        if (!response.ok) throw new Error(body.error || "Unable to load revenue")
        setData(body)
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load revenue") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, sessionLoading, matchId, attempt])

  const matches = data ? Array.from(new Map(data.rows.map((row) => [row.matchTitle, row.matchTitle])).values()) : []

  return <MainLayout><div className="space-y-5">
    <PageHeader
      title="Revenue"
      description="Live issued-ticket revenue split by complimentary and sale. All prices are GST-inclusive at 18%; the GST component on each side is shown separately."
      onRefresh={() => setAttempt((value) => value + 1)}
      refreshing={loading}
    />
    <Card className="shadow-none"><CardContent className="p-4">
      <FilterSelect value={matchId} onChange={setMatchId} label="Match" options={[{ value: "", label: "All matches" }, ...matches.map((title) => ({ value: title, label: title }))]} />
    </CardContent></Card>
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view revenue.</p>
      : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
        {!data ? null : data.rows.length === 0 ? <Card><EmptyState icon={<IndianRupee className="h-10 w-10" />} title="No issued tickets yet" description="Revenue appears once tickets are issued through the allocation and distribution workflow. Approved-but-not-yet-issued tickets will show here as a pending pipeline." /></Card> : <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Revenue totals">
            <MetricCard label="Total issued" value={formatNumber(data.totals.totalIssued)} icon={Ticket} tone="blue" description="Complimentary + sale tickets issued" />
            <MetricCard label="Purchase revenue" value={formatCurrency(data.totals.saleRevenue)} icon={TrendingUp} tone="violet" description={`GST on sale: ${formatCurrency(data.totals.gstOnSale)}`} />
            <MetricCard label="Complimentary revenue" value={formatCurrency(data.totals.complimentaryRevenue)} icon={IndianRupee} tone="green" description={`GST borne by ACA: ${formatCurrency(data.totals.gstOnComplimentary)}`} />
            <MetricCard label="Net of GST" value={formatCurrency(data.totals.netOfGst)} icon={IndianRupee} tone="amber" description={`Total GST component: ${formatCurrency(data.totals.gstTotal)}`} />
          </section>
          {(data.totals.pendingApproved ?? 0) > 0 && <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30"><CardContent className="flex items-center gap-3 p-4"><TrendingUp className="h-5 w-5 text-amber-700" /><p className="text-sm"><strong>{formatNumber(data.totals.pendingApproved ?? 0)} tickets approved, awaiting allocation/issuance.</strong> This is the pending pipeline — revenue above reflects only tickets already issued. Once these are distributed, totals update automatically.</p></CardContent></Card>}
          <Card className="shadow-none"><CardHeader className="p-4 pb-3"><CardTitle className="text-lg">Breakdown by category</CardTitle></CardHeader><CardContent className="p-0">
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Match / category</TableHead><TableHead>Purpose</TableHead><TableHead className="text-right">Complimentary issued</TableHead><TableHead className="text-right">Sale issued</TableHead><TableHead className="text-right">Complimentary ₹</TableHead><TableHead className="text-right">Sale ₹</TableHead><TableHead className="text-right">GST (compl.)</TableHead><TableHead className="text-right">GST (sale)</TableHead></TableRow></TableHeader>
              <TableBody>{data.rows.map((row, index) => <TableRow key={index}>
                <TableCell><p className="font-medium">{row.category}</p><p className="text-xs text-muted-foreground">{row.matchTitle}</p></TableCell>
                <TableCell><Badge variant={row.purpose === "COMPLIMENTARY" ? "secondary" : row.purpose === "PURCHASE" ? "default" : "outline"}>{row.purpose}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.complimentaryIssued)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.saleIssued)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.complimentaryRevenue)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.saleRevenue)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.gstOnComplimentary)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(row.gstOnSale)}</TableCell>
              </TableRow>)}</TableBody>
            </Table></div>
            <p className="p-3 text-xs text-muted-foreground">Complimentary value uses ACA&apos;s configured nominal price (₹{formatNumber(data.nominalComplimentaryPrice)} per ticket), not the actual face value, so a high-value complimentary ticket does not transfer a large GST burden to the association. GST on both sides is calculated at {data.gstRatePercent}% of the GST-inclusive price ({data.gstRatePercent}/{100 + data.gstRatePercent}).</p>
          </CardContent></Card>
        </>}
      </DataState>}
  </div></MainLayout>
}
