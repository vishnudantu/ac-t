"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Calendar,
  FileText,
  ClipboardList,
  Package,
  Truck,
  Ticket,
  Shield,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { formatDate, formatDateTime, getStatusColor, getPriorityColor, formatStatus } from "@/lib/utils"
import Link from "next/link"

const statCards = [
  { title: "Total Requests", value: "1,247", icon: FileText, color: "text-blue-600", bg: "bg-blue-100", change: "+12%", trend: "up" },
  { title: "Pending Approvals", value: "89", icon: ClipboardList, color: "text-yellow-600", bg: "bg-yellow-100", change: "+5", trend: "up" },
  { title: "Tickets Allocated", value: "28,450", icon: Package, color: "text-green-600", bg: "bg-green-100", change: "+1,200", trend: "up" },
  { title: "Tickets Distributed", value: "24,180", icon: Truck, color: "text-purple-600", bg: "bg-purple-100", change: "+890", trend: "up" },
  { title: "Available Inventory", value: "9,550", icon: Ticket, color: "text-indigo-600", bg: "bg-indigo-100", change: "-1,200", trend: "down" },
  { title: "Quota Utilization", value: "73%", icon: Shield, color: "text-orange-600", bg: "bg-orange-100", change: "+2%", trend: "up" },
]

const recentRequests = [
  { id: "REQ-2026-0042", requester: "Dr. S. Ramesh", match: "India vs Australia - 2nd ODI", category: "VIP", requested: 20, approved: 15, status: "PARTIALLY_APPROVED", priority: "PROTOCOL", date: "2026-11-20" },
  { id: "REQ-2026-0041", requester: "Mr. K. Venkatesh", match: "India vs Australia - 2nd ODI", category: "PREMIUM", requested: 50, approved: 50, status: "APPROVED", priority: "HIGH", date: "2026-11-20" },
  { id: "REQ-2026-0040", requester: "Ms. L. Padmaja", match: "India vs Australia - 2nd ODI", category: "MEDIA", requested: 30, approved: 25, status: "PARTIALLY_APPROVED", priority: "NORMAL", date: "2026-11-19" },
  { id: "REQ-2026-0039", requester: "Mr. V. Ravi Kumar", match: "India vs Australia - 2nd ODI", category: "GENERAL_EAST", requested: 100, approved: 80, status: "APPROVED", priority: "NORMAL", date: "2026-11-19" },
  { id: "REQ-2026-0038", requester: "Mr. M. Rajesh", match: "India vs Australia - 2nd ODI", category: "VIP", requested: 25, approved: 0, status: "UNDER_REVIEW", priority: "HIGH", date: "2026-11-18" },
  { id: "REQ-2026-0037", requester: "Ms. A. Priya", match: "India vs Australia - 2nd ODI", category: "MEDIA", requested: 15, approved: 15, status: "APPROVED", priority: "NORMAL", date: "2026-11-18" },
  { id: "REQ-2026-0036", requester: "Mr. G. Krishna", match: "India vs Australia - 2nd ODI", category: "GENERAL_WEST", requested: 50, approved: 30, status: "PARTIALLY_APPROVED", priority: "LOW", date: "2026-11-17" },
  { id: "REQ-2026-0035", requester: "Ms. S. Lakshmi", match: "India vs Australia - 2nd ODI", category: "STADIUM_OPS", requested: 40, approved: 40, status: "APPROVED", priority: "NORMAL", date: "2026-11-17" },
]

const upcomingDeadlines = [
  { title: "Request Submission Closes", match: "India vs Australia - 2nd ODI", date: "2026-12-15", daysLeft: 22, type: "request" },
  { title: "Approval Deadline", match: "India vs Australia - 2nd ODI", date: "2026-12-17", daysLeft: 24, type: "approval" },
  { title: "Allocation Deadline", match: "India vs Australia - 2nd ODI", date: "2026-12-18", daysLeft: 25, type: "allocation" },
  { title: "Distribution Deadline", match: "India vs Australia - 2nd ODI", date: "2026-12-19", daysLeft: 26, type: "distribution" },
]

export default function DashboardPage() {
  const { user, loading } = useSession()

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
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user?.fullName?.split(" ")[0]}. Here's your overview.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/requests/new">New Request</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/reports">View Reports</Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className={`${stat.color} h-4 w-4`} />
                      <span className={`text-sm font-medium ${stat.trend === "up" ? "text-green-600" : "text-red-600"}`}>
                        {stat.change} vs last week
                      </span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`${stat.color} h-6 w-6`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Requests */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Requests</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/requests">View All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request ID</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-mono font-medium">
                          <Link href={`/requests/${req.id}`} className="text-primary hover:underline">
                            {req.id}
                          </Link>
                        </TableCell>
                        <TableCell>{req.requester}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{req.match}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{req.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {req.approved > 0 ? `${req.approved} / ${req.requested}` : req.requested}
                        </TableCell>
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
                        <TableCell className="text-muted-foreground">{formatDate(req.date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Upcoming Deadlines */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Upcoming Deadlines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingDeadlines.map((dl) => (
                    <div key={dl.title} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className={`p-2 rounded-lg ${
                        dl.type === "request" ? "bg-blue-100 text-blue-600" :
                        dl.type === "approval" ? "bg-yellow-100 text-yellow-600" :
                        dl.type === "allocation" ? "bg-green-100 text-green-600" :
                        "bg-purple-100 text-purple-600"
                      }`}>
                        {dl.type === "request" && <FileText className="h-4 w-4" />}
                        {dl.type === "approval" && <ClipboardList className="h-4 w-4" />}
                        {dl.type === "allocation" && <Package className="h-4 w-4" />}
                        {dl.type === "distribution" && <Truck className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{dl.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{dl.match}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary">{dl.daysLeft} days</p>
                        <p className="text-xs text-muted-foreground">{formatDate(dl.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/requests/new">
                      <FileText className="h-4 w-4 mr-2" />
                      New Request
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/approvals">
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Review Approvals
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/allocations">
                      <Package className="h-4 w-4 mr-2" />
                      Manage Allocations
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/distribution">
                      <Truck className="h-4 w-4 mr-2" />
                      Issue Tickets
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/inventory">
                      <Ticket className="h-4 w-4 mr-2" />
                      Check Inventory
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto py-3">
                    <Link href="/reports">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      View Reports
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">5 requests pending approval {'>'} 48 hours</p>
                      <p className="text-xs text-muted-foreground">Escalation may be required</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">VIP category inventory below 10%</p>
                      <p className="text-xs text-muted-foreground">Only 45 VIP tickets remaining</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">All media allocations completed</p>
                      <p className="text-xs text-muted-foreground">200 media tickets distributed</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}