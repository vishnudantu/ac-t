"use client"

import * as React from "react"
import { Download, Eye, FileSpreadsheet, FileText, Upload } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { useToast } from "@/hooks/use-toast"
import { MainLayout } from "@/components/layout/main-layout"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect, Pagination } from "@/components/operations/list-controls"
import { createImport, downloadExport, getExports, getImportDetail, getImports, type ImportJob, type ImportRow, type ExportJob } from "@/components/operations/api"
import { useOperationData } from "@/components/operations/use-operation-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime, formatNumber } from "@/lib/utils"

const PAGE_SIZE = 20
const IMPORT_TYPES = ["REQUESTERS", "INVENTORY", "QUOTAS", "REQUESTS"] as const
const EXPORT_TYPES = ["REQUESTS", "ALLOCATIONS", "INVENTORY", "QUOTAS", "DISTRIBUTION", "AUDIT", "REPORTS"] as const
const importPermissions: Record<typeof IMPORT_TYPES[number], string> = { REQUESTERS: "requests:write", INVENTORY: "inventory:import", QUOTAS: "quotas:write", REQUESTS: "requests:bulk_import" }
const exportPermissions: Record<typeof EXPORT_TYPES[number], string> = { REQUESTS: "requests:export", ALLOCATIONS: "allocations:read", INVENTORY: "inventory:read", QUOTAS: "quotas:read", DISTRIBUTION: "distribution:read", AUDIT: "audit:export", REPORTS: "reports:export" }
const hasAny = (permissions: string[], keys: string[]): boolean => keys.some((key) => permissions.includes(key))
const allOptions = (types: readonly string[]): { value: string; label: string }[] => [{ value: "all", label: "All types" }, ...types.map((type) => ({ value: type, label: type }))]

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "success" | "destructive" | "warning" | "default"> = { COMPLETED: "success", FAILED: "destructive", PARTIAL: "warning" }
  return <Badge variant={variants[status] || "default"}>{status}</Badge>
}

function ImportHistory({ jobs, onDetails }: { jobs: ImportJob[]; onDetails: (id: string) => void }) {
  return <Table><TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Type</TableHead><TableHead>Match</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Imported / Total</TableHead><TableHead>Created</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
    {jobs.map((job) => <TableRow key={job.id}><TableCell className="font-mono text-xs">{job.jobNumber}</TableCell><TableCell><Badge variant="secondary">{job.importType}</Badge></TableCell><TableCell>{job.match?.title || "—"}</TableCell><TableCell><span className="block max-w-56 truncate font-mono text-xs">{job.fileName}</span><span className="text-xs text-muted-foreground">{formatNumber(job.fileSize / 1024)} KB</span></TableCell><TableCell><StatusBadge status={job.status} /></TableCell><TableCell className="text-right">{job.importedRows} / {job.totalRows}<span className="block text-xs text-muted-foreground">{job.invalidRows} invalid · {job.duplicateRows} duplicate</span></TableCell><TableCell><span className="text-xs">{formatDateTime(job.createdAt)}</span><span className="block text-xs text-muted-foreground">{job.creator?.fullName || "System"}</span></TableCell><TableCell><Button variant="ghost" size="icon" aria-label={`View ${job.jobNumber}`} onClick={() => onDetails(job.id)}><Eye className="h-4 w-4" /></Button></TableCell></TableRow>)}
  </TableBody></Table>
}

function ExportHistory({ jobs }: { jobs: ExportJob[] }) {
  return <Table><TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Type</TableHead><TableHead>Match</TableHead><TableHead>Format</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Records</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>
    {jobs.map((job) => <TableRow key={job.id}><TableCell className="font-mono text-xs">{job.jobNumber}</TableCell><TableCell><Badge variant="secondary">{job.exportType}</Badge></TableCell><TableCell>{job.match?.title || "All matches"}</TableCell><TableCell><Badge variant="outline">{job.format}</Badge></TableCell><TableCell><StatusBadge status={job.status} /><span className="block text-xs text-muted-foreground">{job.fileName}</span></TableCell><TableCell className="text-right">{formatNumber(job.recordCount)}</TableCell><TableCell><span className="text-xs">{formatDateTime(job.createdAt)}</span><span className="block text-xs text-muted-foreground">{job.creator?.fullName || "System"}</span></TableCell></TableRow>)}
  </TableBody></Table>
}

function ImportRowDetails({ rows }: { rows: ImportRow[] }) {
  return <Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead>Errors</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.rowNumber}</TableCell><TableCell><pre className="max-w-80 whitespace-pre-wrap break-all text-xs">{row.rawData}</pre></TableCell><TableCell><StatusBadge status={row.status} /></TableCell><TableCell className="max-w-80 whitespace-pre-wrap text-xs">{row.errors || "—"}</TableCell></TableRow>)}</TableBody></Table>
}

export default function AdminImportExportPage() {
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()
  const [tab, setTab] = React.useState("imports")
  const [importPage, setImportPage] = React.useState(1)
  const [exportPage, setExportPage] = React.useState(1)
  const [importType, setImportType] = React.useState("all")
  const [exportType, setExportType] = React.useState("all")
  const [importOpen, setImportOpen] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [newImportType, setNewImportType] = React.useState<typeof IMPORT_TYPES[number]>("REQUESTERS")
  const [file, setFile] = React.useState<File | null>(null)
  const [newExportType, setNewExportType] = React.useState<typeof EXPORT_TYPES[number]>("REQUESTS")
  const [format, setFormat] = React.useState<"CSV" | "XLSX">("CSV")
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState("")
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const permissions = user?.permissions || []
  const canList = hasAny(permissions, [...Object.values(importPermissions), ...Object.values(exportPermissions)])
  const importData = useOperationData(React.useCallback((signal) => getImports(signal, { limit: PAGE_SIZE, offset: (importPage - 1) * PAGE_SIZE, type: importType }), [importPage, importType, canList]))
  const exportData = useOperationData(React.useCallback((signal) => getExports(signal, { limit: PAGE_SIZE, offset: (exportPage - 1) * PAGE_SIZE, type: exportType }), [exportPage, exportType, canList]))
  const detail = useOperationData(React.useCallback((signal) => detailId ? getImportDetail(detailId, signal) : Promise.resolve(null), [detailId]))
  const availableExports = EXPORT_TYPES.filter((type) => permissions.includes(exportPermissions[type]))
  const canImport = hasAny(permissions, Object.values(importPermissions))

  React.useEffect(() => { if (availableExports.length && !availableExports.includes(newExportType)) setNewExportType(availableExports[0]) }, [availableExports.join(","), newExportType])

  async function submitImport(event: React.FormEvent) {
    event.preventDefault()
    if (!file) { setFormError("Select a CSV or XLSX file"); return }
    setSaving(true); setFormError("")
    try {
      await createImport(newImportType, file)
      setImportOpen(false); setFile(null); importData.retry()
      toast({ title: "Import finished", description: "Open the job details to review imported rows and validation errors." })
    } catch (cause: unknown) { setFormError(cause instanceof Error ? cause.message : "Import failed") } finally { setSaving(false) }
  }

  async function submitExport(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setFormError("")
    try {
      await downloadExport({ type: newExportType, format })
      setExportOpen(false); exportData.retry()
      toast({ title: "Export downloaded", description: "The completed export has been added to the history." })
    } catch (cause: unknown) { setFormError(cause instanceof Error ? cause.message : "Export failed") } finally { setSaving(false) }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader title="Import / Export Center" description="Import directory and match data, or download live operational exports." />
    {!sessionLoading && !canList ? <p role="alert" className="text-destructive">Your account does not have permission to use the import/export center.</p> : <>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => { setFormError(""); setImportOpen(true) }} disabled={!canImport}><Upload className="mr-2 h-4 w-4" />New import</Button><Button size="sm" variant="outline" onClick={() => { setFormError(""); setExportOpen(true) }} disabled={!availableExports.length}><Download className="mr-2 h-4 w-4" />New export</Button></div>
      <Card className="shadow-none"><CardHeader><CardTitle className="text-base">Download Templates</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{IMPORT_TYPES.map((type) => <Button key={type} variant="outline" size="sm" asChild><a href={`/api/templates?type=${type.toLowerCase()}`} download><FileText className="mr-2 h-4 w-4" />{type}</a></Button>)}</CardContent></Card>
      <Tabs value={tab} onValueChange={setTab}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="imports"><Upload className="mr-2 h-4 w-4" />Imports</TabsTrigger><TabsTrigger value="exports"><Download className="mr-2 h-4 w-4" />Exports</TabsTrigger></TabsList>
        <TabsContent value="imports" className="space-y-4"><FilterSelect value={importType} onChange={(value) => { setImportType(value); setImportPage(1) }} label="Import type" options={allOptions(IMPORT_TYPES)} /><DataState loading={sessionLoading || importData.loading} error={importData.error} onRetry={importData.retry}><Card className="overflow-x-auto shadow-none">{importData.data?.jobs.length ? <><ImportHistory jobs={importData.data.jobs} onDetails={setDetailId} /><Pagination page={importPage} pageSize={PAGE_SIZE} total={importData.data.total} itemCount={importData.data.jobs.length} onPageChange={setImportPage} /></> : <EmptyState icon={<Upload className="h-10 w-10" />} title="No import jobs" description="Start an import to populate this history." />}</Card></DataState></TabsContent>
        <TabsContent value="exports" className="space-y-4"><FilterSelect value={exportType} onChange={(value) => { setExportType(value); setExportPage(1) }} label="Export type" options={allOptions(EXPORT_TYPES)} /><DataState loading={sessionLoading || exportData.loading} error={exportData.error} onRetry={exportData.retry}><Card className="overflow-x-auto shadow-none">{exportData.data?.jobs.length ? <><ExportHistory jobs={exportData.data.jobs} /><Pagination page={exportPage} pageSize={PAGE_SIZE} total={exportData.data.total} itemCount={exportData.data.jobs.length} onPageChange={setExportPage} /></> : <EmptyState icon={<FileSpreadsheet className="h-10 w-10" />} title="No export jobs" description="Downloads and their record counts will appear here." />}</Card></DataState></TabsContent>
      </Tabs>
    </>}
    <Dialog open={importOpen} onOpenChange={(open) => { if (!saving) setImportOpen(open) }}><DialogContent><DialogHeader><DialogTitle>New import</DialogTitle><DialogDescription>Choose a CSV or XLSX file using the downloaded template. Files up to 5MB and 1,000 rows are supported; at most 500 rows are imported.</DialogDescription></DialogHeader><form onSubmit={submitImport} className="space-y-4"><div className="space-y-2"><Label htmlFor="new-import-type">Type</Label><select id="new-import-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={newImportType} onChange={(event) => setNewImportType(event.target.value as typeof IMPORT_TYPES[number])}>{IMPORT_TYPES.filter((type) => permissions.includes(importPermissions[type])).map((type) => <option key={type}>{type}</option>)}</select></div><div className="space-y-2"><Label htmlFor="import-file">CSV or XLSX file</Label><Input id="import-file" type="file" accept=".csv,.xlsx" required onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={saving} /></div>{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !canImport}>{saving ? "Importing…" : "Import"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={exportOpen} onOpenChange={(open) => { if (!saving) setExportOpen(open) }}><DialogContent><DialogHeader><DialogTitle>New export</DialogTitle><DialogDescription>Generate a current CSV or Excel download. Up to 5,000 records are included.</DialogDescription></DialogHeader><form onSubmit={submitExport} className="space-y-4"><div className="space-y-2"><Label htmlFor="new-export-type">Type</Label><select id="new-export-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={newExportType} onChange={(event) => setNewExportType(event.target.value as typeof EXPORT_TYPES[number])}>{availableExports.map((type) => <option key={type}>{type}</option>)}</select></div><div className="space-y-2"><Label htmlFor="new-export-format">Format</Label><select id="new-export-format" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={format} onChange={(event) => setFormat(event.target.value as "CSV" | "XLSX")}><option value="CSV">CSV</option><option value="XLSX">Excel (.xlsx)</option></select></div>{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setExportOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !availableExports.length}>{saving ? "Generating…" : "Download"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(detailId)} onOpenChange={(open) => { if (!open) setDetailId(null) }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{detail.data?.job.jobNumber || "Import details"}</DialogTitle><DialogDescription>First 200 rows. Imported entity references are stored with each imported row.</DialogDescription></DialogHeader><DataState loading={detail.loading} error={detail.error} onRetry={detail.retry}><div className="overflow-x-auto">{detail.data?.rows.length ? <ImportRowDetails rows={detail.data.rows} /> : <EmptyState title="No rows" description="This import job has no row records." />}</div></DataState></DialogContent></Dialog>
  </div></MainLayout>
}
