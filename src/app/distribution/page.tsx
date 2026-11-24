"use client"

import { useState } from "react"
import { PackagePlus, Send, Truck } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination, SearchInput } from "@/components/operations/list-controls"
import { PageHeader } from "@/components/operations/page-header"
import { BatchList } from "@/components/lifecycle/batch-list"
import { CreateBatchDialog } from "@/components/lifecycle/create-batch-dialog"
import { IssueTicketsDialog } from "@/components/lifecycle/issue-tickets-dialog"
import { useIssuanceOptions } from "@/components/lifecycle/use-issuance-options"
import { useLifecycleData } from "@/components/lifecycle/use-lifecycle-data"
import type { DistributionBatch, MatchOption } from "@/components/lifecycle/types"
import { formatNumber } from "@/lib/utils"

const PAGE_SIZE = 20
const statusOptions = ["all", "PREPARING", "READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((value) => ({ value, label: value === "all" ? "All statuses" : value.toLowerCase().replace(/(^|_)(\w)/g, (_, prefix: string, letter: string) => `${prefix ? " " : ""}${letter.toUpperCase()}`) }))

export default function DistributionPage() {
  const { user, loading: sessionLoading } = useSession()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(1)
  const [batchOpen, setBatchOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueBatchId, setIssueBatchId] = useState<string | undefined>()
  const canRead = Boolean(user?.permissions.includes("distribution:read"))
  const canWrite = Boolean(user?.permissions.includes("distribution:write"))
  const canIssue = Boolean(user?.permissions.includes("distribution:issue"))
  const canConfirm = Boolean(user?.permissions.includes("allocations:confirm"))
  const { data, loading, error, refresh } = useLifecycleData<DistributionBatch>("distribution", { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, status }, !sessionLoading && canRead)
  const matches = useLifecycleData<MatchOption>("matches", { limit: 100, offset: 0 }, batchOpen && canWrite && Boolean(user?.permissions.includes("matches:read")))
  const batches = data?.items ?? []
  const options = useIssuanceOptions(issueOpen && canIssue, batchOpen && canWrite, Boolean(user?.permissions.includes("requests:read")), Boolean(user?.permissions.includes("allocations:read")))
  const query = search.trim().toLowerCase()
  const filtered = batches.filter((batch) => !query || [batch.batchNumber, batch.match.title, batch.officer?.fullName, ...batch.issuances.flatMap((issuance) => [issuance.issuanceNumber, issuance.recipientName, issuance.ticketCategory])].some((value) => value?.toLowerCase().includes(query)))

  function openIssue(batchId?: string) { setIssueBatchId(batchId); setIssueOpen(true) }
  async function refreshAll() { await Promise.all([refresh(), options.refresh()]) }

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader title="Distribution" description="Prepare batches and issue confirmed ticket allocations to recipients." onRefresh={() => { void refresh() }} refreshing={loading} actions={<>{canWrite && <Button size="sm" variant="outline" onClick={() => setBatchOpen(true)}><PackagePlus className="mr-2 h-4 w-4" />New batch</Button>}{canIssue && <Button size="sm" onClick={() => openIssue()}><Send className="mr-2 h-4 w-4" />Issue tickets</Button>}</>} />
        {!sessionLoading && !canRead ? <Alert variant="destructive"><Truck className="h-4 w-4" /><AlertTitle>Access unavailable</AlertTitle><AlertDescription>Your account does not have permission to view distribution.</AlertDescription></Alert> : <>
          <Card className="shadow-none"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><SearchInput value={search} onChange={setSearch} label="Filter distribution batches on this page" placeholder="Filter by batch, match, recipient, issuance, or category…" /><FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1) }} label="Status" options={statusOptions} /></CardContent></Card>
          <section aria-labelledby="batch-list-title"><div className="mb-3"><h2 id="batch-list-title" className="text-lg font-semibold">Distribution batches</h2><p className="text-sm text-muted-foreground">{data ? `${formatNumber(data.total)} batches with nested issuance records` : "Live distribution records"}</p></div>
            <DataState loading={loading || sessionLoading} error={error} onRetry={() => { void refresh() }} skeleton={<Card className="shadow-none"><TableSkeleton rows={5} /></Card>}><BatchList batches={filtered} canIssue={canIssue} filtered={Boolean(query)} onClear={() => { setSearch(""); setStatus("all"); setPage(1) }} onIssue={openIssue} /></DataState>
            {data && !error && !loading && <div className="mt-4 rounded-lg border bg-card"><Pagination page={page} pageSize={PAGE_SIZE} total={data.total} itemCount={filtered.length} onPageChange={setPage} filtered={Boolean(query)} /></div>}
          </section>
        </>}
        <CreateBatchDialog open={batchOpen} matches={matches.data?.items ?? []} fallbackMatches={options.matches} matchesLoading={matches.loading} fallbackLoading={options.loading} onOpenChange={setBatchOpen} onCreated={refresh} />
        <IssueTicketsDialog open={issueOpen} groups={options.groups} batches={options.batches} drafts={options.drafts} loading={options.loading} loadError={options.error} canConfirm={canConfirm} canReadRequests={Boolean(user?.permissions.includes("requests:read"))} initialBatchId={issueBatchId} onOpenChange={setIssueOpen} onChanged={refreshAll} />
      </div>
    </MainLayout>
  )
}
