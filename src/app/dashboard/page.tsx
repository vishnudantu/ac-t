"use client"

import { CalendarDays, CheckCircle2, FileText, MapPin, Package, Ticket } from "lucide-react"
import Link from "next/link"
import { MainLayout } from "@/components/layout/main-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAllocations, getInventory, getMatches, getRequests } from "@/components/operations/api"
import { EmptyState, ErrorState, MetricSkeleton, TableSkeleton } from "@/components/operations/data-state"
import { MetricCard } from "@/components/operations/metric-card"
import { PageHeader } from "@/components/operations/page-header"
import { useOperationData } from "@/components/operations/use-operation-data"
import { formatDate, formatDateTime, formatNumber, formatStatus, getPriorityColor, getStatusColor } from "@/lib/utils"

const OVERVIEW_LIMIT = 100

type SectionResult<T> = { data: T; error: null } | { data: null; error: string }

interface DashboardData {
  requests: SectionResult<Awaited<ReturnType<typeof getRequests>>>
  matches: SectionResult<Awaited<ReturnType<typeof getMatches>>>
  allocations: SectionResult<Awaited<ReturnType<typeof getAllocations>>>
  inventory: SectionResult<Awaited<ReturnType<typeof getInventory>>>
}

async function loadSection<T>(request: Promise<T>): Promise<SectionResult<T>> {
  try {
    return { data: await request, error: null }
  } catch (cause: unknown) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause
    return { data: null, error: cause instanceof Error ? cause.message : "Unable to load this section." }
  }
}

function loadDashboard(signal: AbortSignal): Promise<DashboardData> {
  return Promise.all([
    loadSection(getRequests(signal, { limit: 5 })),
    loadSection(getMatches(signal, { limit: OVERVIEW_LIMIT })),
    loadSection(getAllocations(signal, { limit: 1 })),
    loadSection(getInventory(signal, { limit: OVERVIEW_LIMIT })),
  ]).then(([requests, matches, allocations, inventory]) => ({ requests, matches, allocations, inventory }))
}

export default function DashboardPage() {
  const { data, loading, error, retry } = useOperationData(loadDashboard)

  const upcomingMatches = (data?.matches.data?.matches ?? [])
    .filter((match) => match.status === "UPCOMING" || match.status === "ACTIVE")
    .sort((a, b) => a.matchDate.localeCompare(b.matchDate))
    .slice(0, 5)
  const loadedAllInventory = data?.inventory.data ? data.inventory.data.total <= data.inventory.data.inventory.length : false

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader title="Operations overview" description="Current requests, match schedules, allocations, and ticket stock." onRefresh={retry} refreshing={loading} />
        {error ? <ErrorState title="Unable to load the overview" error={error} onRetry={retry} loading={loading} /> : (
          <>
            {loading && !data ? <MetricSkeleton count={4} /> : data && (
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operational totals">
                {data.requests.data
                  ? <MetricCard label="Ticket requests" value={data.requests.data.total} icon={FileText} tone="blue" description="All recorded requests" />
                  : <MetricCard label="Ticket requests" value="—" icon={FileText} tone="blue" description={data.requests.error ?? "Request data unavailable"} />}
                {data.allocations.data
                  ? <MetricCard label="Allocations" value={data.allocations.data.total} icon={Package} tone="violet" description="All allocation records" />
                  : <MetricCard label="Allocations" value="—" icon={Package} tone="violet" description={data.allocations.error ?? "Allocation data unavailable"} />}
                {data.inventory.data
                  ? (
                    <MetricCard
                      label="Available tickets"
                      value={data.inventory.data.summary.available}
                      icon={Ticket}
                      tone="green"
                      description={loadedAllInventory ? `Across ${data.inventory.data.total} inventory pools` : `First ${data.inventory.data.inventory.length} of ${data.inventory.data.total} pools`}
                    />
                  )
                  : <MetricCard label="Available tickets" value="—" icon={Ticket} tone="green" description={data.inventory.error ?? "Inventory data unavailable"} />}
                {data.matches.data
                  ? <MetricCard label="Matches" value={data.matches.data.total} icon={CalendarDays} description={upcomingMatches.length > 0 ? `${upcomingMatches.length} active/upcoming fixtures listed below` : "None in the latest 100 match records"} />
                  : <MetricCard label="Matches" value="—" icon={CalendarDays} description={data.matches.error ?? "Match data unavailable"} />}
              </section>
            )}
            {loading && !data ? (
              <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
                <Card className="shadow-none"><TableSkeleton rows={5} /></Card>
                <Card className="shadow-none"><TableSkeleton rows={5} /></Card>
              </div>
            ) : data && (
              <>
                <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
                  <Card className="min-w-0 shadow-none">
                    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4">
                      <div>
                        <CardTitle className="text-lg">Recent requests</CardTitle>
                        <CardDescription className="mt-1">Latest requests by creation date</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" asChild><Link href="/requests">View all</Link></Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      {data.requests.data === null ? (
                        <ErrorState title="Requests unavailable" error={data.requests.error ?? "Unable to load requests."} onRetry={retry} loading={loading} />
                      ) : data.requests.data.requests.length === 0 ? (
                        <EmptyState icon={<FileText className="h-9 w-9" />} title="No requests recorded" description="Recent ticket requests will appear here when they are submitted." />
                      ) : (
                        <Table>
                          <TableCaption className="sr-only">Most recent ticket requests</TableCaption>
                          <TableHeader>
                            <TableRow>
                              <TableHead scope="col">Request</TableHead>
                              <TableHead scope="col">Match &amp; categories</TableHead>
                              <TableHead scope="col" className="text-right">Tickets</TableHead>
                              <TableHead scope="col">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.requests.data.requests.map((request) => (
                              <TableRow key={request.id}>
                                <TableCell className="min-w-44">
                                  <p className="font-mono text-xs font-semibold">{request.requestNumber}</p>
                                  <p className="mt-1.5 text-sm font-medium">{request.requester.fullName}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(request.createdAt)}</p>
                                </TableCell>
                                <TableCell className="min-w-48">
                                  <p className="max-w-60 text-sm">{request.match.title}</p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {request.items.length > 0
                                      ? request.items.map((item) => <Badge key={item.id} variant="secondary">{item.ticketCategory.displayName}</Badge>)
                                      : <span className="text-xs text-muted-foreground">No categories</span>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <p className="font-medium tabular-nums">{formatNumber(request.totalRequested)}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{formatNumber(request.totalApproved)} approved</p>
                                  <Badge className={`${getPriorityColor(request.priority)} mt-2`}>{formatStatus(request.priority)}</Badge>
                                </TableCell>
                                <TableCell><Badge className={getStatusColor(request.status)}>{formatStatus(request.status)}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="min-w-0 shadow-none">
                    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4">
                      <div>
                        <CardTitle className="text-lg">Upcoming matches</CardTitle>
                        <CardDescription className="mt-1">Latest recorded active and scheduled fixtures</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" asChild><Link href="/matches">View all</Link></Button>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      {data.matches.data === null ? (
                        <ErrorState title="Matches unavailable" error={data.matches.error ?? "Unable to load matches."} onRetry={retry} loading={loading} />
                      ) : upcomingMatches.length === 0 ? (
                        <EmptyState icon={<CalendarDays className="h-9 w-9" />} title="No upcoming matches in this overview" description="No active or scheduled fixtures appear in the latest 100 match records. View all matches for the full schedule." />
                      ) : (
                        <div className="divide-y">
                          {upcomingMatches.map((match) => (
                            <div key={match.id} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium">{match.title}</p>
                                <Badge className={`${getStatusColor(match.status)} shrink-0`}>{formatStatus(match.status)}</Badge>
                              </div>
                              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{formatDate(match.matchDate)} · {match.startTime}</p>
                              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{match.venue.name}, {match.venue.city}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <section aria-labelledby="inventory-overview-title">
                  <div className="mb-3">
                    <h2 id="inventory-overview-title" className="text-lg font-semibold">Inventory overview</h2>
                    <p className="text-xs text-muted-foreground">
                      {data.inventory.data && (loadedAllInventory
                        ? `All ${data.inventory.data.total} inventory pools`
                        : `First ${data.inventory.data.inventory.length} of ${data.inventory.data.total} pools; open inventory to page through the rest.`)}
                    </p>
                  </div>
                  {data.inventory.data === null ? (
                    <ErrorState title="Inventory unavailable" error={data.inventory.error ?? "Unable to load inventory."} onRetry={retry} loading={loading} />
                  ) : data.inventory.data.inventory.length === 0 ? (
                    <Card className="shadow-none"><EmptyState icon={<Ticket className="h-9 w-9" />} title="No inventory recorded" description="Ticket stock totals will appear here when inventory pools are available." /></Card>
                  ) : (
                    <Card className="shadow-none">
                      <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                        {([
                          ["Total stock", data.inventory.data.summary.total],
                          ["Reserved", data.inventory.data.summary.reserved],
                          ["Allocated, unissued", data.inventory.data.summary.allocatedUnissued],
                          ["Committed", data.inventory.data.summary.allocated],
                          ["Issued", data.inventory.data.summary.issued],
                        ] as const).map(([label, value]) => (
                          <div key={label} className="flex items-center gap-3">
                            <div className="rounded-md bg-muted p-2 text-primary" aria-hidden="true"><CheckCircle2 className="h-4 w-4" /></div>
                            <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold tabular-nums">{formatNumber(value)}</p></div>
                          </div>
                        ))}
                      </CardContent>
                      <div className="flex justify-end border-t p-3"><Button variant="outline" size="sm" asChild><Link href="/inventory">View inventory</Link></Button></div>
                    </Card>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </MainLayout>
  )
}
