"use client"

import { useState } from "react"
import { ClipboardCheck } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { DataState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination, SearchInput } from "@/components/operations/list-controls"
import { PageHeader } from "@/components/operations/page-header"
import { ApprovalQueue } from "@/components/lifecycle/approval-queue"
import { useLifecycleData } from "@/components/lifecycle/use-lifecycle-data"
import type { ApprovalStepRecord } from "@/components/lifecycle/types"
import { formatNumber } from "@/lib/utils"

const PAGE_SIZE = 20
const statusOptions = [
  { value: "PENDING", label: "Awaiting review" },
  { value: "IN_PROGRESS", label: "In progress" },
]

export default function ApprovalsPage() {
  const { user, loading: sessionLoading } = useSession()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("PENDING")
  const [page, setPage] = useState(1)
  const canRead = Boolean(user?.permissions.includes("approvals:read"))
  const canDecide = Boolean(user?.permissions.includes("approvals:decide"))
  const { data, loading, error, refresh } = useLifecycleData<ApprovalStepRecord>("approvals", {
    limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, status,
  }, !sessionLoading && canRead)

  const query = search.trim().toLowerCase()
  const filtered = (data?.items ?? []).filter((step) => !query || [
    step.request.requestNumber, step.request.requester.fullName, step.request.match.title,
    step.name, step.assignedRole?.displayName,
  ].some((value) => value?.toLowerCase().includes(query)))

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader title="Approvals" description="Review assigned request steps and record item-level decisions." onRefresh={() => { void refresh() }} refreshing={loading} />
        {!sessionLoading && !canRead ? (
          <Alert variant="destructive"><ClipboardCheck className="h-4 w-4" /><AlertTitle>Access unavailable</AlertTitle><AlertDescription>Your account does not have permission to view approvals.</AlertDescription></Alert>
        ) : (
          <>
            <Card className="shadow-none"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><SearchInput value={search} onChange={setSearch} label="Filter approval steps on this page" placeholder="Filter this page by request, requester, match, or step…" /><FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1) }} label="Status" options={statusOptions} /></CardContent></Card>
            <section aria-labelledby="approval-list-title">
              <div className="mb-3"><h2 id="approval-list-title" className="text-lg font-semibold">Your approval queue</h2><p className="text-sm text-muted-foreground">{data ? `${formatNumber(data.total)} assigned steps awaiting your decision` : "Only steps assigned directly to you or your active global roles."}</p></div>
              <DataState loading={loading || sessionLoading} error={error} onRetry={() => { void refresh() }} skeleton={<Card className="shadow-none"><TableSkeleton rows={5} /></Card>}>
                <ApprovalQueue steps={filtered} canDecide={canDecide} historical={false} filtered={Boolean(query)} onClear={() => { setSearch(""); setStatus("PENDING"); setPage(1) }} onDecided={refresh} />
              </DataState>
              {data && !error && !loading && <div className="mt-4 rounded-lg border bg-card"><Pagination page={page} pageSize={PAGE_SIZE} total={data.total} itemCount={filtered.length} onPageChange={setPage} filtered={Boolean(query)} /></div>}
            </section>
          </>
        )}
      </div>
    </MainLayout>
  )
}
