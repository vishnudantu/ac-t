"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ClipboardList,
  Search,
  Filter,
  Eye,
  Check,
  X,
  ArrowUp,
  AlertTriangle,
} from "lucide-react"
import { formatDate, formatStatus, getStatusColor, getPriorityColor } from "@/lib/utils"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

const pendingApprovals = [
  {
    id: "REQ-2026-0038",
    requester: "Mr. M. Rajesh",
    org: "Reliance Industries",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "VIP", requested: 25, approved: 0, available: 45 },
    ],
    totalRequested: 25,
    status: "UNDER_REVIEW",
    priority: "HIGH",
    step: "Senior Authority Approval",
    stepOrder: 4,
    totalSteps: 4,
    submittedAt: "2026-11-18T10:30:00",
    deadline: "2026-11-20T10:30:00",
    quota: "SPONSORS",
    quotaUsed: 85,
  },
  {
    id: "REQ-2026-0042",
    requester: "Dr. S. Ramesh",
    org: "Andhra Cricket Association",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "VIP", requested: 20, approved: 15, available: 45 },
      { category: "PREMIUM", requested: 10, approved: 10, available: 1800 },
    ],
    totalRequested: 30,
    status: "PARTIALLY_APPROVED",
    priority: "PROTOCOL",
    step: "Quota Controller Check",
    stepOrder: 3,
    totalSteps: 4,
    submittedAt: "2026-11-20T09:15:00",
    deadline: "2026-11-21T09:15:00",
    quota: "ACA_OFFICIALS",
    quotaUsed: 62,
  },
  {
    id: "REQ-2026-0040",
    requester: "Ms. L. Padmaja",
    org: "BCCI",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "MEDIA", requested: 30, approved: 25, available: 200 },
    ],
    totalRequested: 30,
    status: "PARTIALLY_APPROVED",
    priority: "NORMAL",
    step: "Department Coordinator Review",
    stepOrder: 2,
    totalSteps: 4,
    submittedAt: "2026-11-19T14:20:00",
    deadline: "2026-11-20T14:20:00",
    quota: "BCCI",
    quotaUsed: 78,
  },
  {
    id: "REQ-2026-0036",
    requester: "Mr. G. Krishna",
    org: "ACA Member",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "GENERAL_WEST", requested: 50, approved: 30, available: 5000 },
    ],
    totalRequested: 50,
    status: "UNDER_REVIEW",
    priority: "LOW",
    step: "Desk Verification",
    stepOrder: 1,
    totalSteps: 4,
    submittedAt: "2026-11-17T11:00:00",
    deadline: "2026-11-18T11:00:00",
    quota: "MEMBER",
    quotaUsed: 45,
  },
]

const completedApprovals = [
  {
    id: "REQ-2026-0041",
    requester: "Mr. K. Venkatesh",
    org: "Andhra Cricket Association",
    match: "India vs Australia - 2nd ODI",
    items: [{ category: "PREMIUM", requested: 50, approved: 50 }],
    totalRequested: 50,
    totalApproved: 50,
    status: "APPROVED",
    priority: "HIGH",
    decidedBy: "Senior Management",
    decidedAt: "2026-11-20T11:00:00",
  },
  {
    id: "REQ-2026-0037",
    requester: "Ms. A. Priya",
    org: "Star Sports",
    match: "India vs Australia - 2nd ODI",
    items: [{ category: "MEDIA", requested: 15, approved: 15 }],
    totalRequested: 15,
    totalApproved: 15,
    status: "APPROVED",
    priority: "NORMAL",
    decidedBy: "Dept Coordinator",
    decidedAt: "2026-11-18T16:30:00",
  },
  {
    id: "REQ-2026-0035",
    requester: "Ms. S. Lakshmi",
    org: "Stadium Operations",
    match: "India vs Australia - 2nd ODI",
    items: [{ category: "STADIUM_OPS", requested: 40, approved: 40 }],
    totalRequested: 40,
    totalApproved: 40,
    status: "APPROVED",
    priority: "NORMAL",
    decidedBy: "Quota Controller",
    decidedAt: "2026-11-17T15:45:00",
  },
]

export default function ApprovalsPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("pending")
  const [search, setSearch] = React.useState("")
  const [selectedRequest, setSelectedRequest] = React.useState<typeof pendingApprovals[0] | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [action, setAction] = React.useState<"approve" | "reject" | "partial" | "return">("approve")
  const [remarks, setRemarks] = React.useState("")
  const [approvedQty, setApprovedQty] = React.useState<Record<string, number>>({})

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const handleAction = (req: typeof pendingApprovals[0], act: "approve" | "reject" | "partial" | "return") => {
    setSelectedRequest(req)
    setAction(act)
    setRemarks("")
    if (act === "partial") {
      setApprovedQty(req.items.reduce((acc, item) => ({ ...acc, [item.category]: Math.min(item.requested, item.available) }), {}))
    }
    setDialogOpen(true)
  }

  const confirmAction = () => {
    if (!selectedRequest) return
    // In real app, call API
    console.log(`${action} request ${selectedRequest.id}`, { remarks, approvedQty })
    setDialogOpen(false)
    setSelectedRequest(null)
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
            <p className="text-muted-foreground">Review and decide on ticket requests</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {pendingApprovals.length} Pending
            </Badge>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <Button
            variant={activeTab === "pending" ? "default" : "ghost"}
            className="border-none bg-transparent px-4"
            onClick={() => setActiveTab("pending")}
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Pending Review ({pendingApprovals.length})
          </Button>
          <Button
            variant={activeTab === "completed" ? "default" : "ghost"}
            className="border-none bg-transparent px-4"
            onClick={() => setActiveTab("completed")}
          >
            <Check className="h-4 w-4 mr-2" />
            Completed ({completedApprovals.length})
          </Button>
        </div>

        {/* Pending Approvals */}
        {activeTab === "pending" && (
          <>
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search requests..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Approval Cards */}
            <div className="space-y-4">
              {pendingApprovals.map((req) => (
                <Card key={req.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-6">
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto]">
                      {/* Request Info */}
                      <div className="lg:col-span-1">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <Link href={`/requests/${req.id}`} className="font-mono font-medium text-primary hover:underline">
                              {req.id}
                            </Link>
                            <p className="text-sm text-muted-foreground">{req.requester} · {req.org}</p>
                            <p className="text-sm text-muted-foreground">{req.match}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getPriorityColor(req.priority)}>
                              {formatStatus(req.priority)}
                            </Badge>
                            <Badge className={getStatusColor(req.status)}>
                              {formatStatus(req.status)}
                            </Badge>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="mt-4 space-y-2">
                          {req.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Badge variant="secondary">{item.category}</Badge>
                                <div className="text-sm">
                                  <span className="font-medium">Requested: {item.requested}</span>
                                  {item.approved > 0 && (
                                    <span className="text-green-600 ml-2">Approved: {item.approved}</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Available: {item.available}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Progress */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>Step {req.stepOrder} of {req.totalSteps}: {req.step}</span>
                            <span className="text-muted-foreground">
                              Quota: {req.quota} ({req.quotaUsed}% used)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${(req.stepOrder / req.totalSteps) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Deadline */}
                      <div className="text-center lg:text-right">
                        <p className="text-sm text-muted-foreground">Submitted</p>
                        <p className="font-medium">{formatDate(req.submittedAt)}</p>
                        <p className="text-sm text-muted-foreground mt-2">Deadline</p>
                        <p className="font-medium text-destructive">
                          {formatDate(req.deadline)}
                          <AlertTriangle className="h-4 w-4 inline ml-1" />
                        </p>
                      </div>

                      {/* Totals */}
                      <div className="text-center lg:text-right">
                        <p className="text-sm text-muted-foreground">Total Requested</p>
                        <p className="text-2xl font-bold">{req.totalRequested}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        <Button onClick={() => handleAction(req, "approve")} className="w-full">
                          <Check className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button variant="outline" onClick={() => handleAction(req, "partial")} className="w-full">
                          Partial Approve
                        </Button>
                        <Button variant="outline" onClick={() => handleAction(req, "return")} className="w-full">
                          <ArrowUp className="h-4 w-4 mr-2" />
                          Return
                        </Button>
                        <Button variant="destructive" onClick={() => handleAction(req, "reject")} className="w-full">
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                        <Button variant="ghost" size="sm" asChild className="w-full">
                          <Link href={`/requests/${req.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Completed Approvals */}
        {activeTab === "completed" && (
          <Card>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request ID</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Requested</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Decided By</TableHead>
                      <TableHead>Decided At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedApprovals.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-mono font-medium">
                          <Link href={`/requests/${req.id}`} className="text-primary hover:underline">
                            {req.id}
                          </Link>
                        </TableCell>
                        <TableCell>{req.requester}</TableCell>
                        <TableCell>{req.org}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {req.items.map((item, idx) => (
                              <Badge key={idx} variant="secondary">
                                {item.category} ({item.approved}/{item.requested})
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{req.totalRequested}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">{req.totalApproved}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(req.status)}>
                            {formatStatus(req.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{req.decidedBy}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(req.decidedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === "approve" && "Approve Request"}
                {action === "reject" && "Reject Request"}
                {action === "partial" && "Partial Approval"}
                {action === "return" && "Return for Clarification"}
              </DialogTitle>
              <DialogDescription>
                Request: {selectedRequest?.id} - {selectedRequest?.requester}
              </DialogDescription>
            </DialogHeader>
            {action === "partial" && selectedRequest && (
              <div className="space-y-4 py-4">
                {selectedRequest.items.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <label className="text-sm font-medium flex items-center justify-between">
                      <span>{item.category}</span>
                      <span className="text-muted-foreground">Available: {item.available}</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={Math.min(item.requested, item.available)}
                      value={approvedQty[item.category] || 0}
                      onChange={(e) => setApprovedQty({ ...approvedQty, [item.category]: parseInt(e.target.value) || 0 })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-4 py-4">
              <label className="text-sm font-medium">Remarks (required for reject/return)</label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter remarks..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={action === "reject" ? "destructive" : "default"}
                onClick={confirmAction}
                disabled={(["reject", "return"].includes(action) && !remarks.trim())}
              >
                Confirm {action.charAt(0).toUpperCase() + action.slice(1)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}