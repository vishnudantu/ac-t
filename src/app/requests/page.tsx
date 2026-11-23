"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  FileText,
  Plus,
  Search,
  Filter,
  Edit,
  Eye,
  Download,
  Upload,
  MoreHorizontal,
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

const requests = [
  {
    id: "REQ-2026-0042",
    requester: "Dr. S. Ramesh",
    org: "Andhra Cricket Association",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "VIP", requested: 20, approved: 15 },
      { category: "PREMIUM", requested: 10, approved: 10 },
    ],
    totalRequested: 30,
    totalApproved: 25,
    status: "PARTIALLY_APPROVED",
    priority: "PROTOCOL",
    source: "IN_PERSON",
    date: "2026-11-20",
    assignedTo: "Admin User",
  },
  {
    id: "REQ-2026-0041",
    requester: "Mr. K. Venkatesh",
    org: "Andhra Cricket Association",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "PREMIUM", requested: 50, approved: 50 },
    ],
    totalRequested: 50,
    totalApproved: 50,
    status: "APPROVED",
    priority: "HIGH",
    source: "EMAIL",
    date: "2026-11-20",
    assignedTo: "Admin User",
  },
  {
    id: "REQ-2026-0040",
    requester: "Ms. L. Padmaja",
    org: "BCCI",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "MEDIA", requested: 30, approved: 25 },
    ],
    totalRequested: 30,
    totalApproved: 25,
    status: "PARTIALLY_APPROVED",
    priority: "NORMAL",
    source: "LETTER",
    date: "2026-11-19",
    assignedTo: "John Doe",
  },
  {
    id: "REQ-2026-0039",
    requester: "Mr. V. Ravi Kumar",
    org: "Visakhapatnam DCA",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "GENERAL_EAST", requested: 100, approved: 80 },
    ],
    totalRequested: 100,
    totalApproved: 80,
    status: "APPROVED",
    priority: "NORMAL",
    source: "WHATSAPP",
    date: "2026-11-19",
    assignedTo: "Jane Smith",
  },
  {
    id: "REQ-2026-0038",
    requester: "Mr. M. Rajesh",
    org: "Reliance Industries",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "VIP", requested: 25, approved: 0 },
    ],
    totalRequested: 25,
    totalApproved: 0,
    status: "UNDER_REVIEW",
    priority: "HIGH",
    source: "ONLINE_FORM",
    date: "2026-11-18",
    assignedTo: "Admin User",
  },
  {
    id: "REQ-2026-0037",
    requester: "Ms. A. Priya",
    org: "Star Sports",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "MEDIA", requested: 15, approved: 15 },
    ],
    totalRequested: 15,
    totalApproved: 15,
    status: "APPROVED",
    priority: "NORMAL",
    source: "EMAIL",
    date: "2026-11-18",
    assignedTo: "John Doe",
  },
  {
    id: "REQ-2026-0036",
    requester: "Mr. G. Krishna",
    org: "ACA Member",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "GENERAL_WEST", requested: 50, approved: 30 },
    ],
    totalRequested: 50,
    totalApproved: 30,
    status: "PARTIALLY_APPROVED",
    priority: "LOW",
    source: "PHONE",
    date: "2026-11-17",
    assignedTo: "Jane Smith",
  },
  {
    id: "REQ-2026-0035",
    requester: "Ms. S. Lakshmi",
    org: "Stadium Operations",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "STADIUM_OPS", requested: 40, approved: 40 },
    ],
    totalRequested: 40,
    totalApproved: 40,
    status: "APPROVED",
    priority: "NORMAL",
    source: "INTERNAL",
    date: "2026-11-17",
    assignedTo: "Admin User",
  },
]

export default function RequestsPage() {
  const { user, loading } = useSession()
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [priorityFilter, setPriorityFilter] = React.useState("all")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const filteredRequests = requests.filter((req) => {
    const matchesSearch = req.id.toLowerCase().includes(search.toLowerCase()) ||
      req.requester.toLowerCase().includes(search.toLowerCase()) ||
      req.org.toLowerCase().includes(search.toLowerCase()) ||
      req.match.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || req.status === statusFilter
    const matchesPriority = priorityFilter === "all" || req.priority === priorityFilter
    return matchesSearch && matchesStatus && matchesPriority
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Requests</h1>
            <p className="text-muted-foreground">Manage ticket requests from all sources</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/requests/import">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/requests/export">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Link>
            </Button>
            <Button asChild>
              <Link href="/requests/new">
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, requester, organization, match..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex h-10 w-[180px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PARTIALLY_APPROVED">Partially Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="WAITLISTED">Waitlisted</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="CLOSED">Closed</option>
                </select>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="flex h-10 w-[160px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Priority</option>
                  <option value="PROTOCOL">Protocol</option>
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Requests ({requests.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono font-medium">
                        <Link href={`/requests/${req.id}`} className="text-primary hover:underline">
                          {req.id}
                        </Link>
                      </TableCell>
                      <TableCell>{req.requester}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{req.org}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{req.match}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {req.items.map((item, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {item.category} ({item.approved > 0 ? `${item.approved}/${item.requested}` : item.requested})
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{req.totalRequested}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">{req.totalApproved}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(req.status)}>
                          {formatStatus(req.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(req.priority)}>
                          {formatStatus(req.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{req.source}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(req.date)}</TableCell>
                      <TableCell className="text-sm">{req.assignedTo}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/requests/${req.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/requests/${req.id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Duplicate</DropdownMenuItem>
                            <DropdownMenuItem>Assign</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">Cancel Request</DropdownMenuItem>
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

        {filteredRequests.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No requests found</h3>
              <p className="mt-2 text-muted-foreground">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}