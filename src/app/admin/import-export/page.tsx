"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Upload,
  Download,
  FileText,
  Search,
  Filter,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  MoreHorizontal,
  Package,
  Users,
  Shield,
  Truck,
} from "lucide-react"
import { formatDateTime, formatNumber } from "@/lib/utils"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const importJobs = [
  {
    id: "IMP-2026-0005",
    type: "REQUESTS",
    match: "India vs Australia - 2nd ODI",
    fileName: "requests_batch_nov.xlsx",
    fileSize: 45234,
    status: "COMPLETED",
    totalRows: 150,
    validRows: 142,
    invalidRows: 8,
    duplicateRows: 0,
    importedRows: 142,
    createdBy: "operator1@aca.gov.in",
    createdAt: "2026-11-19T14:10:00",
    completedAt: "2026-11-19T14:10:45",
  },
  {
    id: "IMP-2026-0004",
    type: "INVENTORY",
    match: "India vs Australia - 2nd ODI",
    fileName: "manifest_ind_vs_sl.xlsx",
    fileSize: 95528,
    status: "COMPLETED",
    totalRows: 35,
    validRows: 35,
    invalidRows: 0,
    duplicateRows: 0,
    importedRows: 35,
    createdBy: "admin@aca.gov.in",
    createdAt: "2026-11-18T10:00:00",
    completedAt: "2026-11-18T10:00:12",
  },
  {
    id: "IMP-2026-0003",
    type: "REQUESTERS",
    match: null,
    fileName: "requesters_directory.xlsx",
    fileSize: 12450,
    status: "PARTIAL",
    totalRows: 50,
    validRows: 45,
    invalidRows: 3,
    duplicateRows: 2,
    importedRows: 45,
    createdBy: "operator2@aca.gov.in",
    createdAt: "2026-11-15T11:30:00",
    completedAt: "2026-11-15T11:30:20",
  },
  {
    id: "IMP-2026-0002",
    type: "QUOTAS",
    match: "India vs Australia - 2nd ODI",
    fileName: "quota_allocations.xlsx",
    fileSize: 8900,
    status: "FAILED",
    totalRows: 9,
    validRows: 0,
    invalidRows: 9,
    duplicateRows: 0,
    importedRows: 0,
    errorSummary: "Invalid quota pool references",
    createdBy: "quota1@aca.gov.in",
    createdAt: "2026-11-14T09:00:00",
  },
  {
    id: "IMP-2026-0001",
    type: "DISTRIBUTION",
    match: "India vs Australia - 2nd ODI",
    fileName: "distribution_plan.xlsx",
    fileSize: 15600,
    status: "COMPLETED",
    totalRows: 200,
    validRows: 198,
    invalidRows: 2,
    duplicateRows: 0,
    importedRows: 198,
    createdBy: "distribution1@aca.gov.in",
    createdAt: "2026-11-13T16:00:00",
    completedAt: "2026-11-13T16:00:35",
  },
]

const exportJobs = [
  {
    id: "EXP-2026-0008",
    type: "REQUESTS",
    match: "India vs Australia - 2nd ODI",
    format: "EXCEL",
    status: "COMPLETED",
    fileName: "all_requests_20261120.xlsx",
    fileSize: 245600,
    recordCount: 1247,
    createdBy: "admin@aca.gov.in",
    createdAt: "2026-11-20T10:00:00",
    completedAt: "2026-11-20T10:00:15",
  },
  {
    id: "EXP-2026-0007",
    type: "ALLOCATIONS",
    match: "India vs Australia - 2nd ODI",
    format: "PDF",
    status: "COMPLETED",
    fileName: "allocation_manifest_20261120.pdf",
    fileSize: 1024000,
    recordCount: 892,
    createdBy: "emily.davis@aca.gov.in",
    createdAt: "2026-11-20T09:30:00",
    completedAt: "2026-11-20T09:30:08",
  },
  {
    id: "EXP-2026-0006",
    type: "INVENTORY",
    match: "India vs Australia - 2nd ODI",
    format: "EXCEL",
    status: "COMPLETED",
    fileName: "inventory_report_20261120.xlsx",
    fileSize: 45600,
    recordCount: 35,
    createdBy: "emily.davis@aca.gov.in",
    createdAt: "2026-11-20T09:00:00",
    completedAt: "2026-11-20T09:00:03",
  },
  {
    id: "EXP-2026-0005",
    type: "RECONCILIATION",
    match: "South Zone vs North Zone - Final",
    format: "PDF",
    status: "COMPLETED",
    fileName: "final_reconciliation_duleep.pdf",
    fileSize: 2048000,
    recordCount: 1,
    createdBy: "admin@aca.gov.in",
    createdAt: "2026-11-12T14:00:00",
    completedAt: "2026-11-12T14:00:25",
  },
  {
    id: "EXP-2026-0004",
    type: "QUOTAS",
    match: "India vs Australia - 2nd ODI",
    format: "EXCEL",
    status: "COMPLETED",
    fileName: "quota_utilization_20261119.xlsx",
    fileSize: 34200,
    recordCount: 9,
    createdBy: "michael.brown@aca.gov.in",
    createdAt: "2026-11-19T15:00:00",
    completedAt: "2026-11-19T15:00:02",
  },
]

export default function AdminImportExportPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("imports")
  const [search, setSearch] = React.useState("")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "destructive" | "warning" | "success" | "info"> = {
      COMPLETED: "success",
      PARTIAL: "warning",
      FAILED: "destructive",
      VALIDATING: "default",
      IMPORTING: "default",
      QUEUED: "default",
      PROCESSING: "default",
    }
    return <Badge variant={variants[status] || "default"}>{status}</Badge>
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "REQUESTS": return <FileText className="h-3.5 w-3.5" />
      case "INVENTORY": return <Package className="h-3.5 w-3.5" />
      case "REQUESTERS": return <Users className="h-3.5 w-3.5" />
      case "QUOTAS": return <Shield className="h-3.5 w-3.5" />
      case "DISTRIBUTION": return <Truck className="h-3.5 w-3.5" />
      case "ALLOCATIONS": return <Package className="h-3.5 w-3.5" />
      case "RECONCILIATION": return <FileText className="h-3.5 w-3.5" />
      default: return <FileText className="h-3.5 w-3.5" />
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Import / Export Center</h1>
            <p className="text-muted-foreground">Manage bulk data operations</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="imports">
              <Upload className="h-4 w-4 mr-2" />
              Imports ({importJobs.length})
            </TabsTrigger>
            <TabsTrigger value="exports">
              <Download className="h-4 w-4 mr-2" />
              Exports ({exportJobs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="imports" className="space-y-4">
            {/* Import Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  New Import
                  <Button variant="outline" size="sm" asChild>
                    <a href="/api/templates?type=requests" download>
                      <Download className="h-4 w-4 mr-2" />
                      Download Templates
                    </a>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/requests/new">
                      <Upload className="h-8 w-8" />
                      <span>Import Requests</span>
                      <span className="text-xs text-muted-foreground">Excel/CSV</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/inventory">
                      <Upload className="h-8 w-8" />
                      <span>Manage Inventory</span>
                      <span className="text-xs text-muted-foreground">Create pools</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/requesters">
                      <Upload className="h-8 w-8" />
                      <span>Add Requesters</span>
                      <span className="text-xs text-muted-foreground">Requester directory</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/quotas">
                      <Upload className="h-8 w-8" />
                      <span>Manage Quotas</span>
                      <span className="text-xs text-muted-foreground">Quota pools</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/distribution">
                      <Upload className="h-8 w-8" />
                      <span>Distribute Tickets</span>
                      <span className="text-xs text-muted-foreground">Issue and track</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <a href="/api/templates?type=inventory" download>
                      <Download className="h-8 w-8" />
                      <span>Inventory Template</span>
                      <span className="text-xs text-muted-foreground">Sample CSV</span>
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Import Jobs Table */}
            <Card>
              <CardHeader>
                <CardTitle>Import History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Valid</TableHead>
                        <TableHead className="text-right">Invalid</TableHead>
                        <TableHead className="text-right">Imported</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-sm">{job.id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getTypeIcon(job.type)}
                              <Badge variant="secondary">{job.type}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{job.match || "-"}</TableCell>
                          <TableCell className="font-mono text-sm truncate max-w-[200px]">{job.fileName}</TableCell>
                          <TableCell className="text-sm">{formatNumber(job.fileSize / 1024)} KB</TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                          <TableCell className="text-right">{job.totalRows}</TableCell>
                          <TableCell className="text-right text-green-600">{job.validRows}</TableCell>
                          <TableCell className="text-right text-red-600">{job.invalidRows}</TableCell>
                          <TableCell className="text-right text-blue-600 font-medium">{job.importedRows}</TableCell>
                          <TableCell className="text-sm">{job.createdBy}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{job.completedAt ? formatDateTime(job.completedAt) : "-"}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{job.id}</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => {}}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                {job.status !== "COMPLETED" && (
                                  <DropdownMenuItem>View Errors</DropdownMenuItem>
                                )}
                                <DropdownMenuItem>Download Error Report</DropdownMenuItem>
                                {job.status === "PARTIAL" && (
                                  <DropdownMenuItem>Retry Failed Rows</DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exports" className="space-y-4">
            {/* Export Actions */}
            <Card>
              <CardHeader>
                <CardTitle>New Export</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/requests">
                      <Download className="h-8 w-8" />
                      <span>Export Requests</span>
                      <span className="text-xs text-muted-foreground">Open request register</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/allocations">
                      <Download className="h-8 w-8" />
                      <span>Export Allocations</span>
                      <span className="text-xs text-muted-foreground">Open allocations</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/inventory">
                      <Download className="h-8 w-8" />
                      <span>Export Inventory</span>
                      <span className="text-xs text-muted-foreground">Open inventory</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/reports">
                      <Download className="h-8 w-8" />
                      <span>Export Reports</span>
                      <span className="text-xs text-muted-foreground">CSV / Excel / Print</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/distribution">
                      <Download className="h-8 w-8" />
                      <span>Export Distribution</span>
                      <span className="text-xs text-muted-foreground">Open distribution</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/audit">
                      <Download className="h-8 w-8" />
                      <span>Export Audit Logs</span>
                      <span className="text-xs text-muted-foreground">Open audit trail</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto p-6 flex flex-col items-center gap-2" asChild>
                    <Link href="/reports">
                      <Download className="h-8 w-8" />
                      <span>Custom Export</span>
                      <span className="text-xs text-muted-foreground">Build from reports</span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Export Jobs Table */}
            <Card>
              <CardHeader>
                <CardTitle>Export History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead className="text-right">Records</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exportJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-sm">{job.id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getTypeIcon(job.type)}
                              <Badge variant="secondary">{job.type}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{job.match || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{job.format}</Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                          <TableCell className="font-mono text-sm truncate max-w-[200px]">{job.fileName}</TableCell>
                          <TableCell className="text-sm">{formatNumber(job.fileSize / 1024)} KB</TableCell>
                          <TableCell className="text-right font-medium">{formatNumber(job.recordCount)}</TableCell>
                          <TableCell className="text-sm">{job.createdBy}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{job.completedAt ? formatDateTime(job.completedAt) : "-"}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{job.id}</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => {}}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {}}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download File
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}

