"use client"

import { useState } from "react"
import { CheckCircle2, Layers3, Shield } from "lucide-react"
import { MainLayout } from "@/components/layout/main-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getQuotas } from "@/components/operations/api"
import { DataState, EmptyState, MetricSkeleton, TableSkeleton } from "@/components/operations/data-state"
import { Pagination, SearchInput } from "@/components/operations/list-controls"
import { MetricCard } from "@/components/operations/metric-card"
import { PageHeader } from "@/components/operations/page-header"
import { useOperationData } from "@/components/operations/use-operation-data"
import type { Quota } from "@/components/operations/types"
import { formatNumber } from "@/lib/utils"

const PAGE_SIZE = 20

function QuotaPoolCard({ quota }: { quota: Quota }) {
  const remaining = Math.max(0, quota.totalAllocation - quota.consumedQuantity)

  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{quota.displayName}</CardTitle>
          <CardDescription className="mt-1">{quota.match.title} · {quota.owner ? `Owner: ${quota.owner.fullName}` : "No owner assigned"}</CardDescription>
        </div>
        <Badge className={quota.isActive ? "status-approved" : "status-closed"}>
          {quota.isActive ? "Active" : "Inactive"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <dl className="grid grid-cols-3 gap-3 border-y py-3">
          <div><dt className="text-xs text-muted-foreground">Total allocation</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatNumber(quota.totalAllocation)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Consumed</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatNumber(quota.consumedQuantity)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Remaining</dt><dd className="mt-1 text-lg font-bold tabular-nums text-green-700 dark:text-green-400">{formatNumber(remaining)}</dd></div>
        </dl>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category allocations</h3>
          {quota.quotaAllocations.length === 0 ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">No category allocations are linked to this quota.</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Ticket allocations and consumption by category</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Category</TableHead>
                  <TableHead scope="col" className="text-right">Allocated</TableHead>
                  <TableHead scope="col" className="text-right">Consumed</TableHead>
                  <TableHead scope="col" className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quota.quotaAllocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell><Badge variant="secondary">{allocation.ticketCategory.displayName}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(allocation.allocatedQuantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(allocation.consumedQuantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Math.max(0, allocation.allocatedQuantity - allocation.consumedQuantity))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {quota.childQuotas.length > 0 && (
          <p className="text-xs text-muted-foreground">Child quotas: {quota.childQuotas.map((child) => child.displayName).join(", ")}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function QuotasPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const { data, loading, error, retry } = useOperationData(
    (signal) => getQuotas(signal, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [page],
  )

  const quotas = data?.quotas ?? []
  const query = search.trim().toLowerCase()
  const filteredQuotas = quotas.filter((quota) =>
    !query || [quota.name, quota.displayName, quota.match.title, quota.owner?.fullName,
      ...quota.quotaAllocations.map((allocation) => allocation.ticketCategory.displayName)]
      .some((value) => value?.toLowerCase().includes(query)),
  )
  const totals = quotas.reduce((result, quota) => ({
    allocation: result.allocation + quota.totalAllocation,
    consumed: result.consumed + quota.consumedQuantity,
  }), { allocation: 0, consumed: 0 })

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader
          title="Quota Management"
          description="Stakeholder quotas, category allocations, and recorded consumption."
          onRefresh={retry}
          refreshing={loading}
        />
        {loading && !data ? <MetricSkeleton count={3} /> : error ? null : data && (
          <section aria-labelledby="quota-totals">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="quota-totals" className="text-sm font-semibold">Quota totals</h2>
              <p className="text-xs text-muted-foreground">Current page · {quotas.length} pools{data.total > quotas.length ? ` of ${data.total}` : ""}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Total allocation" value={totals.allocation} icon={Shield} tone="blue" />
              <MetricCard label="Consumed" value={totals.consumed} icon={CheckCircle2} tone="violet" />
              <MetricCard label="Remaining" value={Math.max(0, totals.allocation - totals.consumed)} icon={Layers3} tone="green" />
            </div>
          </section>
        )}
        <Card className="shadow-none">
          <CardContent className="p-4">
            <SearchInput value={search} onChange={setSearch} label="Filter quotas on this page" placeholder="Filter this page by quota, match, owner, or category…" />
          </CardContent>
        </Card>
        <section aria-labelledby="quota-list-title">
          <div className="mb-3">
            <h2 id="quota-list-title" className="text-lg font-semibold">Quota pools</h2>
            <p className="text-sm text-muted-foreground">{data ? `${formatNumber(data.total)} quota pools` : "Live quota records"}</p>
          </div>
          <DataState loading={loading} error={error} onRetry={retry} skeleton={<Card className="shadow-none"><TableSkeleton rows={5} /></Card>}>
            {filteredQuotas.length === 0 ? (
              <Card className="shadow-none">
                <EmptyState
                  icon={<Shield className="h-10 w-10" />}
                  title={query ? "No matching quotas" : "No quotas recorded"}
                  description={query ? "No quotas on this page match your search. Try another page or clear the search." : "Quota pools will appear here when they are available."}
                  onClear={query ? () => setSearch("") : undefined}
                />
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredQuotas.map((quota) => <QuotaPoolCard key={quota.id} quota={quota} />)}
              </div>
            )}
          </DataState>
          {data && !error && !loading && (
            <div className="mt-4 rounded-lg border bg-card shadow-none">
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} itemCount={filteredQuotas.length} onPageChange={setPage} filtered={Boolean(query)} />
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  )
}
