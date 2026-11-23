"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Shield,
  Search,
  Filter,
  Plus,
  ArrowRightLeft,
  Eye,
  AlertTriangle,
  CheckCircle,
} from "lucide-react"
import { formatNumber, getStatusColor } from "@/lib/utils"
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

const quotaPools = [
  {
    id: "1",
    name: "ACA_OFFICIALS",
    displayName: "ACA Officials",
    owner: "System Administrator",
    totalAllocation: 5000,
    consumed: 3100,
    remaining: 1900,
    utilization: 62,
    status: "ACTIVE",
    allocations: [
      { category: "VIP", allocated: 1000, consumed: 500 },
      { category: "PREMIUM", allocated: 2000, consumed: 1200 },
      { category: "GENERAL_EAST", allocated: 1000, consumed: 800 },
      { category: "GENERAL_WEST", allocated: 1000, consumed: 600 },
    ],
  },
  {
    id: "2",
    name: "BCCI",
    displayName: "BCCI & Visiting Officials",
    owner: "BCCI Coordinator",
    totalAllocation: 3000,
    consumed: 2340,
    remaining: 660,
    utilization: 78,
    status: "ACTIVE",
    allocations: [
      { category: "VIP", allocated: 500, consumed: 400 },
      { category: "PREMIUM", allocated: 1000, consumed: 940 },
      { category: "PLAYER_GUEST", allocated: 300, consumed: 300 },
    ],
  },
  {
    id: "3",
    name: "GOVERNMENT",
    displayName: "Government & Protocol",
    owner: "Protocol Officer",
    totalAllocation: 4000,
    consumed: 2800,
    remaining: 1200,
    utilization: 70,
    status: "ACTIVE",
    allocations: [
      { category: "VIP", allocated: 1000, consumed: 800 },
      { category: "PREMIUM", allocated: 1500, consumed: 1200 },
      { category: "GENERAL_EAST", allocated: 1000, consumed: 500 },
      { category: "GENERAL_WEST", allocated: 500, consumed: 300 },
    ],
  },
  {
    id: "4",
    name: "SPONSORS",
    displayName: "Sponsors & Commercial Partners",
    owner: "Commercial Manager",
    totalAllocation: 3000,
    consumed: 2550,
    remaining: 450,
    utilization: 85,
    status: "WARNING",
    allocations: [
      { category: "PREMIUM", allocated: 1500, consumed: 1350 },
      { category: "GENERAL_EAST", allocated: 1000, consumed: 900 },
      { category: "VIP", allocated: 500, consumed: 300 },
    ],
  },
  {
    id: "5",
    name: "PLAYERS",
    displayName: "Players & Team Management",
    owner: "Team Liaison",
    totalAllocation: 2000,
    consumed: 1300,
    remaining: 700,
    utilization: 65,
    status: "ACTIVE",
    allocations: [
      { category: "PLAYER_GUEST", allocated: 1000, consumed: 800 },
      { category: "VIP", allocated: 500, consumed: 300 },
      { category: "PREMIUM", allocated: 500, consumed: 200 },
    ],
  },
  {
    id: "6",
    name: "MEDIA",
    displayName: "Media",
    owner: "Media Coordinator",
    totalAllocation: 500,
    consumed: 400,
    remaining: 100,
    utilization: 80,
    status: "ACTIVE",
    allocations: [
      { category: "MEDIA", allocated: 200, consumed: 200 },
    ],
  },
  {
    id: "7",
    name: "STADIUM_OPS",
    displayName: "Stadium Operations",
    owner: "Stadium Manager",
    totalAllocation: 1000,
    consumed: 600,
    remaining: 400,
    utilization: 60,
    status: "ACTIVE",
    allocations: [
      { category: "STADIUM_OPS", allocated: 200, consumed: 200 },
      { category: "GENERAL_EAST", allocated: 500, consumed: 400 },
      { category: "GENERAL_WEST", allocated: 300, consumed: 0 },
    ],
  },
  {
    id: "8",
    name: "SPECIAL_INVITES",
    displayName: "Special Invitations",
    owner: "Protocol Officer",
    totalAllocation: 1000,
    consumed: 500,
    remaining: 500,
    utilization: 50,
    status: "ACTIVE",
    allocations: [
      { category: "VIP", allocated: 500, consumed: 300 },
      { category: "PREMIUM", allocated: 500, consumed: 200 },
    ],
  },
  {
    id: "9",
    name: "DISCRETIONARY",
    displayName: "Management Discretionary",
    owner: "Senior Management",
    totalAllocation: 2000,
    consumed: 1000,
    remaining: 1000,
    utilization: 50,
    status: "ACTIVE",
    allocations: [
      { category: "DISCRETIONARY", allocated: 2000, consumed: 1000 },
    ],
  },
]

const transfers = [
  { id: "TRF-001", from: "DISCRETIONARY", to: "SPONSORS", category: "PREMIUM", qty: 200, status: "COMPLETED", date: "2026-11-15" },
  { id: "TRF-002", from: "ACA_OFFICIALS", to: "GOVERNMENT", category: "VIP", qty: 100, status: "APPROVED", date: "2026-11-18" },
  { id: "TRF-003", from: "STADIUM_OPS", to: "MEDIA", category: "GENERAL_EAST", qty: 50, status: "PENDING", date: "2026-11-20" },
]

export default function QuotasPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("pools")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const totals = quotaPools.reduce((acc, pool) => ({
    total: acc.total + pool.totalAllocation,
    consumed: acc.consumed + pool.consumed,
    remaining: acc.remaining + pool.remaining,
  }), { total: 0, consumed: 0, remaining: 0 })

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quota Management</h1>
            <p className="text-muted-foreground">Manage ticket quotas for stakeholder groups</p>
          </div>
          <Button asChild>
            <Link href="/quotas/new">
              <Plus className="h-4 w-4 mr-2" />
              New Quota Pool
            </Link>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Quota</p>
                  <p className="text-2xl font-bold">{formatNumber(totals.total)}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100">
                  <Shield className="text-blue-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Consumed</p>
                  <p className="text-2xl font-bold text-blue-600">{formatNumber(totals.consumed)}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100">
                  <CheckCircle className="text-blue-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Remaining</p>
                  <p className="text-2xl font-bold text-green-600">{formatNumber(totals.remaining)}</p>
                </div>
                <div className="p-3 rounded-xl bg-green-100">
                  <Shield className="text-green-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pools">Quota Pools ({quotaPools.length})</TabsTrigger>
            <TabsTrigger value="transfers">Transfers ({transfers.length})</TabsTrigger>
            <TabsTrigger value="categories">By Category</TabsTrigger>
          </TabsList>

          <TabsContent value="pools" className="space-y-4">
            {quotaPools.map((pool) => (
              <Card key={pool.id} className={pool.utilization > 80 ? "border-l-4 border-l-destructive" : ""}>
                <CardContent className="p-6">
                  <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
                    <div className="lg:col-span-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-medium">{pool.displayName}</h3>
                          <p className="text-sm text-muted-foreground">{pool.name} · Owner: {pool.owner}</p>
                        </div>
                        <Badge className={getStatusColor(pool.status)}>{pool.status}</Badge>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>Utilization</span>
                          <span className={pool.utilization > 80 ? "text-destructive" : pool.utilization > 60 ? "text-yellow-600" : "text-green-600"}>
                            {pool.utilization}%
                          </span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              pool.utilization > 80 ? "bg-destructive" :
                              pool.utilization > 60 ? "bg-yellow-500" :
                              "bg-green-500"
                            }`}
                            style={{ width: `${pool.utilization}%` }}
                          />
                        </div>
                      </div>

                      {/* Category Breakdown */}
                      <div className="mt-4 space-y-1">
                        {pool.allocations.map((alloc, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                            <Badge variant="secondary" className="mr-2">{alloc.category}</Badge>
                            <span>Allocated: <span className="font-medium">{formatNumber(alloc.allocated)}</span></span>
                            <span className="text-green-600">Used: <span className="font-medium">{formatNumber(alloc.consumed)}</span></span>
                            <span className="text-muted-foreground">Remaining: {formatNumber(alloc.allocated - alloc.consumed)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Allocation</p>
                      <p className="text-2xl font-bold">{formatNumber(pool.totalAllocation)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Consumed</p>
                      <p className="text-2xl font-bold text-blue-600">{formatNumber(pool.consumed)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className="text-2xl font-bold text-green-600">{formatNumber(pool.remaining)}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button onClick={() => {}} className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        Details
                      </Button>
                      <Button variant="outline" onClick={() => {}} className="w-full">
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Transfer
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="transfers">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Quota Transfers
                  <Button size="sm" asChild>
                    <Link href="/quotas/transfer/new">
                      <Plus className="h-4 w-4 mr-2" />
                      New Transfer
                    </Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transfer ID</TableHead>
                        <TableHead>From Pool</TableHead>
                        <TableHead>To Pool</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((trf) => (
                        <TableRow key={trf.id}>
                          <TableCell className="font-mono">{trf.id}</TableCell>
                          <TableCell>{trf.from}</TableCell>
                          <TableCell>{trf.to}</TableCell>
                          <TableCell><Badge variant="secondary">{trf.category}</Badge></TableCell>
                          <TableCell className="text-right font-medium">{formatNumber(trf.qty)}</TableCell>
                          <TableCell><Badge className={getStatusColor(trf.status)}>{trf.status}</Badge></TableCell>
                          <TableCell>{trf.date}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                {trf.status === "PENDING" && <>
                                  <DropdownMenuItem>Approve</DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive">Reject</DropdownMenuItem>
                                </>}
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

          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle>Quota Allocations by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Total Quota</TableHead>
                        <TableHead className="text-right">Total Consumed</TableHead>
                        <TableHead className="text-right">Total Remaining</TableHead>
                        <TableHead>Pools</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        "VIP", "PREMIUM", "GENERAL_EAST", "GENERAL_WEST", "GENERAL_NORTH", "GENERAL_SOUTH",
                        "MEDIA", "PLAYER_GUEST", "STADIUM_OPS", "DISCRETIONARY"
                      ].map((cat) => {
                        const catPools = quotaPools.flatMap(p => p.allocations.filter(a => a.category === cat))
                        if (catPools.length === 0) return null
                        const total = catPools.reduce((s, a) => s + a.allocated, 0)
                        const consumed = catPools.reduce((s, a) => s + a.consumed, 0)
                        const poolNames = quotaPools.filter(p => p.allocations.some(a => a.category === cat)).map(p => p.displayName).join(", ")
                        return (
                          <TableRow key={cat}>
                            <TableCell><Badge variant="secondary">{cat}</Badge></TableCell>
                            <TableCell className="text-right">{formatNumber(total)}</TableCell>
                            <TableCell className="text-right">{formatNumber(consumed)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatNumber(total - consumed)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{poolNames}</TableCell>
                          </TableRow>
                        )
                      })}
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

import { MoreHorizontal } from "lucide-react"