"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Package,
  Search,
  Filter,
  Eye,
  Edit,
  Plus,
  Minus,
  ArrowRight,
  Lock,
  Unlock,
} from "lucide-react"
import { formatDate, formatStatus, getStatusColor } from "@/lib/utils"
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

const pendingAllocations = [
  {
    id: "ALC-2026-0012",
    requestId: "REQ-2026-0042",
    requester: "Dr. S. Ramesh",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "VIP", approved: 15, allocated: 10, available: 45, stand: "VIP Pavilion A" },
      { category: "PREMIUM", approved: 10, allocated: 10, available: 1800, stand: "Premium Stand C" },
    ],
    totalApproved: 25,
    totalAllocated: 20,
    status: "PENDING_REVIEW",
    officer: "Allocation Officer 1",
    createdAt: "2026-11-20T11:00:00",
  },
  {
    id: "ALC-2026-0011",
    requestId: "REQ-2026-0041",
    requester: "Mr. K. Venkatesh",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "PREMIUM", approved: 50, allocated: 50, available: 1800, stand: "Premium Stand C" },
    ],
    totalApproved: 50,
    totalAllocated: 50,
    status: "CONFIRMED",
    officer: "Allocation Officer 2",
    createdAt: "2026-11-20T10:30:00",
  },
  {
    id: "ALC-2026-0010",
    requestId: "REQ-2026-0039",
    requester: "Mr. V. Ravi Kumar",
    match: "India vs Australia - 2nd ODI",
    items: [
      { category: "GENERAL_EAST", approved: 80, allocated: 80, available: 5000, stand: "East Stand E1" },
    ],
    totalApproved: 80,
    totalAllocated: 80,
    status: "LOCKED",
    officer: "Allocation Officer 1",
    createdAt: "2026-11-19T15:00:00",
  },
]

const completedAllocations = [
  {
    id: "ALC-2026-0009",
    requestId: "REQ-2026-0037",
    requester: "Ms. A. Priya",
    match: "India vs Australia - 2nd ODI",
    items: [{ category: "MEDIA", approved: 15, allocated: 15, stand: "Media Centre M1" }],
    totalApproved: 15,
    totalAllocated: 15,
    status: "LOCKED",
    officer: "Allocation Officer 2",
    createdAt: "2026-11-18T17:00:00",
  },
  {
    id: "ALC-2026-0008",
    requestId: "REQ-2026-0035",
    requester: "Ms. S. Lakshmi",
    match: "India vs Australia - 2nd ODI",
    items: [{ category: "STADIUM_OPS", approved: 40, allocated: 40, stand: "Operations Block O1" }],
    totalApproved: 40,
    totalAllocated: 40,
    status: "LOCKED",
    officer: "Allocation Officer 1",
    createdAt: "2026-11-17T16:00:00",
  },
]

export default function AllocationsPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("pending")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Allocations</h1>
            <p className="text-muted-foreground">Assign approved tickets to inventory</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {pendingAllocations.length} Pending
            </Badge>
            <Button asChild>
              <Link href="/allocations/new">
                <Plus className="h-4 w-4 mr-2" />
                New Allocation
              </Link>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">Pending ({pendingAllocations.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedAllocations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingAllocations.map((alloc) => (
              <Card key={alloc.id} className="border-l-4 border-l-primary">
                <CardContent className="p-6">
                  <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto]">
                    {/* Request Info */}
                    <div className="lg:col-span-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link href={`/allocations/${alloc.id}`} className="font-mono font-medium text-primary hover:underline">
                            {alloc.id}
                          </Link>
                          <p className="text-sm text-muted-foreground">{alloc.requestId} · {alloc.requester}</p>
                          <p className="text-sm text-muted-foreground">{alloc.match}</p>
                        </div>
                        <Badge className={getStatusColor(alloc.status)}>{formatStatus(alloc.status)}</Badge>
                      </div>

                      {/* Allocation Items */}
                      <div className="mt-4 space-y-2">
                        {alloc.items.map((item, idx) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge variant="secondary">{item.category}</Badge>
                                <span className="text-sm font-medium">
                                  Stand: {item.stand}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span>Approved: <span className="font-medium">{item.approved}</span></span>
                                <span className="text-green-600">Allocated: <span className="font-medium">{item.allocated}</span></span>
                                <span className="text-muted-foreground">Available: {item.available}</span>
                              </div>
                            </div>
                            {item.allocated < item.approved && (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.min(item.approved - item.allocated, item.available)}
                                  defaultValue={Math.min(item.approved - item.allocated, item.available)}
                                  className="w-24 h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                                />
                                <Button size="sm" variant="outline">
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  Allocate
                                </Button>
                                <Button size="sm" variant="ghost">
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Approved</p>
                      <p className="text-2xl font-bold">{alloc.totalApproved}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Allocated</p>
                      <p className="text-2xl font-bold text-green-600">{alloc.totalAllocated}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      <Button onClick={() => {}} className="w-full">
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Allocate All
                      </Button>
                      <Button variant="outline" onClick={() => {}} className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        Review
                      </Button>
                      {alloc.status !== "LOCKED" && (
                        <Button variant="outline" onClick={() => {}} className="w-full">
                          <Lock className="h-4 w-4 mr-2" />
                          Lock
                        </Button>
                      )}
                      {alloc.status === "LOCKED" && (
                        <Button variant="ghost" onClick={() => {}} className="w-full text-orange-600">
                          <Unlock className="h-4 w-4 mr-2" />
                          Unlock
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="completed">
            <Card>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Allocation ID</TableHead>
                        <TableHead>Request ID</TableHead>
                        <TableHead>Requester</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Officer</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedAllocations.map((alloc) => (
                        <TableRow key={alloc.id}>
                          <TableCell className="font-mono font-medium">
                            <Link href={`/allocations/${alloc.id}`} className="text-primary hover:underline">
                              {alloc.id}
                            </Link>
                          </TableCell>
                          <TableCell>{alloc.requestId}</TableCell>
                          <TableCell>{alloc.requester}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {alloc.items.map((item, idx) => (
                                <Badge key={idx} variant="secondary">
                                  {item.category} ({item.allocated})
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{alloc.totalApproved}</TableCell>
                          <TableCell className="text-right text-green-600 font-medium">{alloc.totalAllocated}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(alloc.status)}>
                              {formatStatus(alloc.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{alloc.officer}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(alloc.createdAt)}</TableCell>
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