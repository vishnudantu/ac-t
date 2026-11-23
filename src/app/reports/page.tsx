"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  FileText,
  Users,
  Ticket,
  Package,
  Truck,
  Shield,
  TrendingUp,
  CheckCircle,
} from "lucide-react"
import { formatNumber } from "@/lib/utils"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const matchSummary = {
  totalRequests: 1247,
  totalTicketsRequested: 45230,
  totalApproved: 28450,
  totalRejected: 5200,
  totalWaitlisted: 11580,
  totalAllocated: 27800,
  totalIssued: 24180,
  totalDelivered: 22340,
  totalUncollected: 1840,
  inventoryAvailable: 9550,
  quotaUtilization: 73,
  pendingApprovals: 89,
  awaitingAllocation: 12,
}

const departmentStats = [
  { department: "ACA Officials", requests: 156, ticketsRequested: 8450, ticketsApproved: 6200, utilization: 73 },
  { department: "BCCI", requests: 42, ticketsRequested: 2100, ticketsApproved: 1850, utilization: 88 },
  { department: "Government", requests: 68, ticketsRequested: 3200, ticketsApproved: 2800, utilization: 88 },
  { department: "Sponsors", requests: 89, ticketsRequested: 4200, ticketsApproved: 3550, utilization: 85 },
  { department: "Players", requests: 34, ticketsRequested: 1500, ticketsApproved: 1300, utilization: 87 },
  { department: "Media", requests: 28, ticketsRequested: 400, ticketsApproved: 400, utilization: 100 },
  { department: "Stadium Ops", requests: 45, ticketsRequested: 1800, ticketsApproved: 1600, utilization: 89 },
  { department: "Members", requests: 785, ticketsRequested: 23580, ticketsApproved: 10750, utilization: 46 },
]

const categoryStats = [
  { category: "VIP", requested: 5200, approved: 3800, allocated: 3500, issued: 3200, available: 450 },
  { category: "PREMIUM", requested: 12400, approved: 9200, allocated: 8900, issued: 8100, available: 1800 },
  { category: "GENERAL_EAST", requested: 8500, approved: 6200, allocated: 5800, issued: 5200, available: 5000 },
  { category: "GENERAL_WEST", requested: 7800, approved: 5400, allocated: 5100, issued: 4600, available: 5000 },
  { category: "MEDIA", requested: 400, approved: 400, allocated: 400, issued: 400, available: 200 },
  { category: "PLAYER_GUEST", requested: 1500, approved: 1300, allocated: 1200, issued: 1100, available: 200 },
  { category: "STADIUM_OPS", requested: 1800, approved: 1600, allocated: 1500, issued: 1500, available: 200 },
  { category: "DISCRETIONARY", requested: 2500, approved: 1500, allocated: 1400, issued: 1080, available: 200 },
]

const sourceStats = [
  { source: "IN_PERSON", requests: 234, tickets: 8900 },
  { source: "EMAIL", requests: 189, tickets: 6200 },
  { source: "WHATSAPP", requests: 156, tickets: 4500 },
  { source: "LETTER", requests: 112, tickets: 3800 },
  { source: "PHONE", requests: 98, tickets: 2900 },
  { source: "ONLINE_FORM", requests: 245, tickets: 8500 },
  { source: "INTERNAL", requests: 213, tickets: 10430 },
]

export default function ReportsPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("overview")

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
            <p className="text-muted-foreground">Comprehensive match and operational reports</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/reports/export">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                  <p className="text-2xl font-bold">{formatNumber(matchSummary.totalRequests)}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100">
                  <FileText className="text-blue-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tickets Requested</p>
                  <p className="text-2xl font-bold">{formatNumber(matchSummary.totalTicketsRequested)}</p>
                </div>
                <div className="p-3 rounded-xl bg-gray-100">
                  <Ticket className="text-gray-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold text-green-600">{formatNumber(matchSummary.totalApproved)}</p>
                </div>
                <div className="p-3 rounded-xl bg-green-100">
                  <CheckCircle className="text-green-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Allocated</p>
                  <p className="text-2xl font-bold text-blue-600">{formatNumber(matchSummary.totalAllocated)}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100">
                  <Package className="text-blue-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Issued</p>
                  <p className="text-2xl font-bold text-purple-600">{formatNumber(matchSummary.totalIssued)}</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-100">
                  <Truck className="text-purple-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Delivered</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatNumber(matchSummary.totalDelivered)}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-100">
                  <CheckCircle className="text-emerald-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Available Stock</p>
                  <p className="text-2xl font-bold text-indigo-600">{formatNumber(matchSummary.inventoryAvailable)}</p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-100">
                  <Shield className="text-indigo-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">Quota Utilization</p>
              <p className="text-4xl font-bold text-primary">{matchSummary.quotaUtilization}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">Pending Approvals</p>
              <p className="text-4xl font-bold text-yellow-600">{matchSummary.pendingApprovals}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">Awaiting Allocation</p>
              <p className="text-4xl font-bold text-blue-600">{matchSummary.awaitingAllocation}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">Uncollected</p>
              <p className="text-4xl font-bold text-red-600">{formatNumber(matchSummary.totalUncollected)}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="departments">By Department</TabsTrigger>
            <TabsTrigger value="categories">By Category</TabsTrigger>
            <TabsTrigger value="sources">By Source</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Request Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label: "Approved", value: matchSummary.totalApproved, color: "bg-green-500", total: matchSummary.totalTicketsRequested },
                      { label: "Rejected", value: matchSummary.totalRejected, color: "bg-red-500", total: matchSummary.totalTicketsRequested },
                      { label: "Waitlisted", value: matchSummary.totalWaitlisted, color: "bg-yellow-500", total: matchSummary.totalTicketsRequested },
                      { label: "Pending Review", value: matchSummary.totalTicketsRequested - matchSummary.totalApproved - matchSummary.totalRejected - matchSummary.totalWaitlisted, color: "bg-blue-500", total: matchSummary.totalTicketsRequested },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{item.label}</span>
                          <span className="font-medium">{formatNumber(item.value)} ({(item.value / item.total * 100).toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${item.color} rounded-full`} style={{ width: `${(item.value / item.total) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Fulfillment Pipeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label: "Approved", value: matchSummary.totalApproved, color: "bg-green-500" },
                      { label: "Allocated", value: matchSummary.totalAllocated, color: "bg-blue-500" },
                      { label: "Issued", value: matchSummary.totalIssued, color: "bg-purple-500" },
                      { label: "Delivered", value: matchSummary.totalDelivered, color: "bg-emerald-500" },
                    ].map((item, idx) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{item.label}</span>
                          <span className="font-medium">{formatNumber(item.value)}</span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden relative">
                          <div className={`h-full ${item.color} rounded-full`} style={{ width: `${(item.value / matchSummary.totalApproved) * 100}%` }} />
                          {idx > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                              {(item.value / matchSummary.totalApproved * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="departments">
            <Card>
              <CardHeader>
                <CardTitle>Requests by Department</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Tickets Requested</TableHead>
                        <TableHead className="text-right">Tickets Approved</TableHead>
                        <TableHead className="text-right">Approval Rate</TableHead>
                        <TableHead className="text-right">Quota Utilization</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departmentStats.map((dept) => (
                        <TableRow key={dept.department}>
                          <TableCell>{dept.department}</TableCell>
                          <TableCell className="text-right">{formatNumber(dept.requests)}</TableCell>
                          <TableCell className="text-right">{formatNumber(dept.ticketsRequested)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatNumber(dept.ticketsApproved)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {(dept.ticketsApproved / dept.ticketsRequested * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={dept.utilization > 80 ? "destructive" : dept.utilization > 60 ? "default" : "success"}>
                              {dept.utilization}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle>Tickets by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Requested</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Issued</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Fulfillment %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryStats.map((cat) => (
                        <TableRow key={cat.category}>
                          <TableCell><Badge variant="secondary">{cat.category}</Badge></TableCell>
                          <TableCell className="text-right">{formatNumber(cat.requested)}</TableCell>
                          <TableCell className="text-right">{formatNumber(cat.approved)}</TableCell>
                          <TableCell className="text-right text-blue-600">{formatNumber(cat.allocated)}</TableCell>
                          <TableCell className="text-right text-purple-600">{formatNumber(cat.issued)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatNumber(cat.available)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {(cat.issued / cat.requested * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources">
            <Card>
              <CardHeader>
                <CardTitle>Requests by Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Tickets</TableHead>
                        <TableHead className="text-right">Avg Tickets/Request</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sourceStats.map((src) => (
                        <TableRow key={src.source}>
                          <TableCell><Badge variant="outline">{src.source.replace("_", " ")}</Badge></TableCell>
                          <TableCell className="text-right">{formatNumber(src.requests)}</TableCell>
                          <TableCell className="text-right">{formatNumber(src.tickets)}</TableCell>
                          <TableCell className="text-right">{(src.tickets / src.requests).toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals">
            <Card>
              <CardHeader>
                <CardTitle>Approval Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-3">
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Avg Turnaround</p>
                      <p className="text-3xl font-bold">24.5 hrs</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Partial Approvals</p>
                      <p className="text-3xl font-bold text-yellow-600">23%</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Escalations</p>
                      <p className="text-3xl font-bold text-red-600">12</p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}