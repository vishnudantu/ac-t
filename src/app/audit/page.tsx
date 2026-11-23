"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Database,
  Search,
  Filter,
  Download,
  Eye,
  Clock,
  User,
  AlertTriangle,
  Info,
} from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const auditLogs = [
  {
    id: "AUD-2026-0001",
    timestamp: "2026-11-20T10:30:45",
    user: "admin@aca.gov.in",
    action: "APPROVE",
    entityType: "REQUEST",
    entityId: "REQ-2026-0038",
    details: "Approved 25 VIP tickets for Reliance Industries",
    oldValues: null,
    newValues: { approvedQty: 25, status: "APPROVED" },
    ipAddress: "192.168.1.100",
    severity: "INFO",
  },
  {
    id: "AUD-2026-0002",
    timestamp: "2026-11-20T10:25:12",
    user: "officer1@aca.gov.in",
    action: "ALLOCATE",
    entityType: "ALLOCATION",
    entityId: "ALC-2026-0012",
    details: "Allocated 15 VIP tickets from VIP Pavilion A",
    oldValues: { allocated: 0 },
    newValues: { allocated: 15, stand: "VIP Pavilion A" },
    ipAddress: "192.168.1.101",
    severity: "INFO",
  },
  {
    id: "AUD-2026-0003",
    timestamp: "2026-11-20T09:45:33",
    user: "admin@aca.gov.in",
    action: "CREATE",
    entityType: "MATCH",
    entityId: "sample-match-1",
    details: "Created new match: India vs Australia - 2nd ODI",
    oldValues: null,
    newValues: { title: "India vs Australia - 2nd ODI", format: "ODI", venueId: "1" },
    ipAddress: "192.168.1.100",
    severity: "INFO",
  },
  {
    id: "AUD-2026-0004",
    timestamp: "2026-11-20T09:30:00",
    user: "distribution1@aca.gov.in",
    action: "ISSUE",
    entityType: "TICKET_ISSUANCE",
    entityId: "ISS-2026-00042",
    details: "Issued 15 VIP tickets to Dr. S. Ramesh",
    oldValues: { status: "ALLOCATED" },
    newValues: { status: "ISSUED", serials: ["VIP-A-001", "VIP-A-002", "VIP-A-003"] },
    ipAddress: "192.168.1.102",
    severity: "INFO",
  },
  {
    id: "AUD-2026-0005",
    timestamp: "2026-11-19T16:20:15",
    user: "quota1@aca.gov.in",
    action: "TRANSFER",
    entityType: "QUOTA_TRANSFER",
    entityId: "TRF-002",
    details: "Transferred 100 VIP tickets from ACA_OFFICIALS to GOVERNMENT",
    oldValues: { fromQuota: "ACA_OFFICIALS", toQuota: "GOVERNMENT", qty: 100 },
    newValues: { status: "APPROVED" },
    ipAddress: "192.168.1.103",
    severity: "WARNING",
  },
  {
    id: "AUD-2026-0006",
    timestamp: "2026-11-19T14:10:00",
    user: "operator1@aca.gov.in",
    action: "IMPORT",
    entityType: "IMPORT_JOB",
    entityId: "IMP-2026-0005",
    details: "Imported 150 requests from Excel file",
    oldValues: null,
    newValues: { totalRows: 150, validRows: 142, invalidRows: 8 },
    ipAddress: "192.168.1.104",
    severity: "INFO",
  },
  {
    id: "AUD-2026-0007",
    timestamp: "2026-11-19T11:05:22",
    user: "admin@aca.gov.in",
    action: "OVERRIDE",
    entityType: "ALLOCATION",
    entityId: "ALC-2026-0010",
    details: "Exception override: Allocated 80 GENERAL_EAST beyond quota",
    oldValues: { allocated: 0, quotaCheck: "EXCEEDED" },
    newValues: { allocated: 80, overrideReason: "Protocol requirement", overrideBy: "admin@aca.gov.in" },
    ipAddress: "192.168.1.100",
    severity: "CRITICAL",
  },
  {
    id: "AUD-2026-0008",
    timestamp: "2026-11-19T10:00:00",
    user: "system",
    action: "LOGIN",
    entityType: "USER",
    entityId: "admin@aca.gov.in",
    details: "User login successful",
    oldValues: null,
    newValues: { mfa: true, ip: "192.168.1.100" },
    ipAddress: "192.168.1.100",
    severity: "INFO",
  },
  {
    id: "AUD-2026-0009",
    timestamp: "2026-11-18T15:30:45",
    user: "distribution2@aca.gov.in",
    action: "HANDOVER",
    entityType: "TICKET_HANDOVER",
    entityId: "HND-2026-0003",
    details: "Handed over 50 PREMIUM tickets to Distribution Officer 1",
    oldValues: { fromOfficer: "distribution2@aca.gov.in", toOfficer: "distribution1@aca.gov.in" },
    newValues: { status: "ACKNOWLEDGED", serials: ["PRE-C-201", "PRE-C-250"] },
    ipAddress: "192.168.1.105",
    severity: "INFO",
  },
  {
    id: "AUD-2026-0010",
    timestamp: "2026-11-18T12:00:00",
    user: "operator2@aca.gov.in",
    action: "DELETE",
    entityType: "REQUEST",
    entityId: "REQ-2026-0030",
    details: "Deleted duplicate request",
    oldValues: { id: "REQ-2026-0030", requester: "Test User" },
    newValues: null,
    ipAddress: "192.168.1.106",
    severity: "WARNING",
  },
]

export default function AuditPage() {
  const { user, loading } = useSession()
  const [search, setSearch] = React.useState("")
  const [actionFilter, setActionFilter] = React.useState("all")
  const [severityFilter, setSeverityFilter] = React.useState("all")
  const [selectedLog, setSelectedLog] = React.useState<typeof auditLogs[0] | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const actions = [...new Set(auditLogs.map(l => l.action))]
  const severities = [...new Set(auditLogs.map(l => l.severity))]

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch = log.id.toLowerCase().includes(search.toLowerCase()) ||
      log.user.toLowerCase().includes(search.toLowerCase()) ||
      log.entityId.toLowerCase().includes(search.toLowerCase()) ||
      log.details.toLowerCase().includes(search.toLowerCase())
    const matchesAction = actionFilter === "all" || log.action === actionFilter
    const matchesSeverity = severityFilter === "all" || log.severity === severityFilter
    return matchesSearch && matchesAction && matchesSeverity
  })

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, "default" | "destructive" | "warning" | "success" | "info"> = {
      INFO: "default",
      WARNING: "warning",
      CRITICAL: "destructive",
    }
    return <Badge variant={variants[severity] || "default"}>{severity}</Badge>
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
            <p className="text-muted-foreground">Track all system activities and changes</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/audit/export">
              <Download className="h-4 w-4 mr-2" />
              Export Logs
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, user, entity, details..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="flex h-10 w-[180px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Actions</option>
                {actions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="flex h-10 w-[160px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Severity</option>
                {severities.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Table */}
        <Card>
          <CardHeader>
            <CardTitle>Audit Trail ({auditLogs.length} entries)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event ID</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">{log.id}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(log.timestamp)}</TableCell>
                      <TableCell className="text-sm">{log.user}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{log.action}</Badge>
                      </TableCell>
                      <TableCell>{log.entityType}</TableCell>
                      <TableCell className="font-mono text-sm">{log.entityId}</TableCell>
                      <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.ipAddress}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => { setSelectedLog(log); setDetailOpen(true); }}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>Export This Event</DropdownMenuItem>
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

        {/* Detail Dialog */}
        {detailOpen && selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetailOpen(false)}>
            <div className="bg-background rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">Audit Event Details</h2>
                  <Button variant="ghost" size="icon" onClick={() => setDetailOpen(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <dl className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Event ID</dt>
                      <dd className="font-mono">{selectedLog.id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Timestamp</dt>
                      <dd>{formatDateTime(selectedLog.timestamp)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">User</dt>
                      <dd>{selectedLog.user}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Action</dt>
                      <dd><Badge variant="secondary">{selectedLog.action}</Badge></dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Entity Type</dt>
                      <dd>{selectedLog.entityType}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Entity ID</dt>
                      <dd className="font-mono">{selectedLog.entityId}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Severity</dt>
                      <dd>{getSeverityBadge(selectedLog.severity)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">IP Address</dt>
                      <dd className="font-mono">{selectedLog.ipAddress}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Details</dt>
                    <dd className="text-sm">{selectedLog.details}</dd>
                  </div>
                  {selectedLog.oldValues && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Old Values</dt>
                      <dd className="text-sm font-mono text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(selectedLog.oldValues, null, 2)}</dd>
                    </div>
                  )}
                  {selectedLog.newValues && (
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">New Values</dt>
                      <dd className="text-sm font-mono text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(selectedLog.newValues, null, 2)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

import { MoreHorizontal, X } from "lucide-react"