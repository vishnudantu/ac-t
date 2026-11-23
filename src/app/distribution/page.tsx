"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Truck,
  Search,
  Filter,
  Eye,
  Plus,
  Check,
  Package,
  User,
  Download,
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

const batches = [
  {
    id: "DIST-2026-0012",
    match: "India vs Australia - 2nd ODI",
    method: "PERSONAL_COLLECTION",
    status: "IN_PROGRESS",
    totalTickets: 150,
    issuedTickets: 89,
    deliveredTickets: 67,
    officer: "Distribution Officer 1",
    createdAt: "2026-11-20T09:00:00",
  },
  {
    id: "DIST-2026-0011",
    match: "India vs Australia - 2nd ODI",
    method: "OFFICE_DELIVERY",
    status: "READY",
    totalTickets: 200,
    issuedTickets: 0,
    deliveredTickets: 0,
    officer: "Distribution Officer 2",
    createdAt: "2026-11-20T08:00:00",
  },
  {
    id: "DIST-2026-0010",
    match: "India vs Australia - 2nd ODI",
    method: "DIGITAL",
    status: "COMPLETED",
    totalTickets: 50,
    issuedTickets: 50,
    deliveredTickets: 50,
    officer: "Distribution Officer 1",
    createdAt: "2026-11-19T16:00:00",
  },
]

const issuances = [
  {
    id: "ISS-2026-00042",
    batchId: "DIST-2026-0012",
    requestId: "REQ-2026-0042",
    requester: "Dr. S. Ramesh",
    match: "India vs Australia - 2nd ODI",
    category: "VIP",
    quantity: 15,
    stand: "VIP Pavilion A",
    serials: ["VIP-A-001", "VIP-A-002", "VIP-A-003"],
    recipient: "Dr. S. Ramesh",
    mobile: "+919876500001",
    method: "PERSONAL_COLLECTION",
    status: "COLLECTED",
    issuedAt: "2026-11-20T10:30:00",
    collectedAt: "2026-11-20T10:35:00",
  },
  {
    id: "ISS-2026-00041",
    batchId: "DIST-2026-0012",
    requestId: "REQ-2026-0042",
    requester: "Dr. S. Ramesh",
    match: "India vs Australia - 2nd ODI",
    category: "PREMIUM",
    quantity: 10,
    stand: "Premium Stand C",
    serials: ["PRE-C-101", "PRE-C-102"],
    recipient: "Mr. K. Venkatesh",
    mobile: "+919876500002",
    method: "REPRESENTATIVE_COLLECTION",
    status: "DELIVERED",
    issuedAt: "2026-11-20T10:40:00",
    deliveredAt: "2026-11-20T10:45:00",
  },
  {
    id: "ISS-2026-00040",
    batchId: "DIST-2026-0011",
    requestId: "REQ-2026-0041",
    requester: "Mr. K. Venkatesh",
    match: "India vs Australia - 2nd ODI",
    category: "PREMIUM",
    quantity: 50,
    stand: "Premium Stand C",
    serials: ["PRE-C-201", "PRE-C-202"],
    recipient: "VDCA Office",
    mobile: "+919876500006",
    method: "OFFICE_DELIVERY",
    status: "ISSUED",
    issuedAt: "2026-11-20T11:00:00",
  },
]

export default function DistributionPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("batches")

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
            <h1 className="text-3xl font-bold tracking-tight">Distribution</h1>
            <p className="text-muted-foreground">Issue and track ticket delivery</p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/distribution/new-batch">
                <Plus className="h-4 w-4 mr-2" />
                New Batch
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/distribution/issuances/new">
                <Package className="h-4 w-4 mr-2" />
                Issue Tickets
              </Link>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="batches">Batches ({batches.length})</TabsTrigger>
            <TabsTrigger value="issuances">Issuances ({issuances.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="batches" className="space-y-4">
            {batches.map((batch) => (
              <Card key={batch.id}>
                <CardContent className="p-6">
                  <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
                    <div>
                      <Link href={`/distribution/batches/${batch.id}`} className="font-mono font-medium text-primary hover:underline">
                        {batch.id}
                      </Link>
                      <p className="text-sm text-muted-foreground">{batch.match}</p>
                    </div>
                    <div>
                      <Badge variant="outline">{batch.method.replace("_", " ")}</Badge>
                      <Badge className={getStatusColor(batch.status)} ml-2>{formatStatus(batch.status)}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold">{batch.totalTickets}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-600">{batch.issuedTickets}</p>
                        <p className="text-xs text-muted-foreground">Issued</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-600">{batch.deliveredTickets}</p>
                        <p className="text-xs text-muted-foreground">Delivered</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{batch.officer}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(batch.createdAt)}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button onClick={() => {}} className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        Manage
                      </Button>
                      <Button variant="outline" onClick={() => {}} className="w-full">
                        <Download className="h-4 w-4 mr-2" />
                        Manifest
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="issuances">
            <Card>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issuance ID</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Request</TableHead>
                        <TableHead>Requester</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Stand</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Issued At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issuances.map((iss) => (
                        <TableRow key={iss.id}>
                          <TableCell className="font-mono font-medium text-sm">{iss.id}</TableCell>
                          <TableCell>{iss.batchId}</TableCell>
                          <TableCell>{iss.requestId}</TableCell>
                          <TableCell>{iss.requester}</TableCell>
                          <TableCell><Badge variant="secondary">{iss.category}</Badge></TableCell>
                          <TableCell className="text-right font-medium">{iss.quantity}</TableCell>
                          <TableCell>{iss.stand}</TableCell>
                          <TableCell>{iss.recipient}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{iss.method.replace("_", " ")}</Badge></TableCell>
                          <TableCell><Badge className={getStatusColor(iss.status)}>{formatStatus(iss.status)}</Badge></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(iss.issuedAt)}</TableCell>
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