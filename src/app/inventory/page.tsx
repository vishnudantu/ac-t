"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Ticket,
  Search,
  Filter,
  Plus,
  Download,
  Upload,
  Eye,
  Edit,
  AlertTriangle,
  CheckCircle,
} from "lucide-react"
import { formatNumber, formatStatus } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const inventory = [
  {
    id: "1",
    category: "VIP",
    stand: "VIP Pavilion",
    block: "A",
    gate: "Gate 1",
    format: "PHYSICAL",
    faceValue: 5000,
    total: 500,
    reserved: 100,
    available: 400,
    allocated: 15,
    issued: 10,
    returned: 0,
    void: 0,
  },
  {
    id: "2",
    category: "VIP",
    stand: "VIP Pavilion",
    block: "B",
    gate: "Gate 1",
    format: "PHYSICAL",
    faceValue: 5000,
    total: 500,
    reserved: 50,
    available: 450,
    allocated: 5,
    issued: 0,
    returned: 0,
    void: 0,
  },
  {
    id: "3",
    category: "PREMIUM",
    stand: "Premium Stand",
    block: "C",
    gate: "Gate 2",
    format: "PHYSICAL",
    faceValue: 3000,
    total: 2000,
    reserved: 200,
    available: 1800,
    allocated: 60,
    issued: 50,
    returned: 0,
    void: 0,
  },
  {
    id: "4",
    category: "PREMIUM",
    stand: "Premium Stand",
    block: "D",
    gate: "Gate 2",
    format: "PHYSICAL",
    faceValue: 3000,
    total: 2000,
    reserved: 200,
    available: 1800,
    allocated: 0,
    issued: 0,
    returned: 0,
    void: 0,
  },
  {
    id: "5",
    category: "GENERAL_EAST",
    stand: "East Stand",
    block: "E1",
    gate: "Gate 3",
    format: "PHYSICAL",
    faceValue: 500,
    total: 5000,
    reserved: 0,
    available: 5000,
    allocated: 80,
    issued: 80,
    returned: 0,
    void: 0,
  },
  {
    id: "6",
    category: "GENERAL_EAST",
    stand: "East Stand",
    block: "E2",
    gate: "Gate 3",
    format: "PHYSICAL",
    faceValue: 500,
    total: 5000,
    reserved: 0,
    available: 5000,
    allocated: 0,
    issued: 0,
    returned: 0,
    void: 0,
  },
  {
    id: "7",
    category: "GENERAL_WEST",
    stand: "West Stand",
    block: "W1",
    gate: "Gate 4",
    format: "PHYSICAL",
    faceValue: 500,
    total: 5000,
    reserved: 0,
    available: 5000,
    allocated: 30,
    issued: 25,
    returned: 0,
    void: 0,
  },
  {
    id: "8",
    category: "MEDIA",
    stand: "Media Centre",
    block: "M1",
    gate: "Gate 7",
    format: "DIGITAL",
    faceValue: 0,
    total: 200,
    reserved: 0,
    available: 200,
    allocated: 15,
    issued: 15,
    returned: 0,
    void: 0,
  },
  {
    id: "9",
    category: "PLAYER_GUEST",
    stand: "Player Pavilion",
    block: "P1",
    gate: "Gate 1",
    format: "PHYSICAL",
    faceValue: 0,
    total: 300,
    reserved: 100,
    available: 200,
    allocated: 0,
    issued: 0,
    returned: 0,
    void: 0,
  },
  {
    id: "10",
    category: "STADIUM_OPS",
    stand: "Operations Block",
    block: "O1",
    gate: "Gate 8",
    format: "DIGITAL",
    faceValue: 0,
    total: 200,
    reserved: 0,
    available: 200,
    allocated: 40,
    issued: 40,
    returned: 0,
    void: 0,
  },
]

// Calculate totals
const totals = inventory.reduce((acc, item) => ({
  total: acc.total + item.total,
  reserved: acc.reserved + item.reserved,
  available: acc.available + item.available,
  allocated: acc.allocated + item.allocated,
  issued: acc.issued + item.issued,
  returned: acc.returned + item.returned,
  void: acc.void + item.void,
}), { total: 0, reserved: 0, available: 0, allocated: 0, issued: 0, returned: 0, void: 0 })

export default function InventoryPage() {
  const { user, loading } = useSession()
  const [search, setSearch] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const categories = [...new Set(inventory.map(i => i.category))]
  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = item.category.toLowerCase().includes(search.toLowerCase()) ||
      item.stand.toLowerCase().includes(search.toLowerCase()) ||
      item.block.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Ticket Inventory</h1>
            <p className="text-muted-foreground">Manage ticket stock for all matches</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/inventory/import">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/inventory/export">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Link>
            </Button>
            <Button asChild>
              <Link href="/inventory/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Inventory
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Stock</p>
                  <p className="text-2xl font-bold">{formatNumber(totals.total)}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100">
                  <Ticket className="text-blue-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Reserved</p>
                  <p className="text-2xl font-bold text-yellow-600">{formatNumber(totals.reserved)}</p>
                </div>
                <div className="p-3 rounded-xl bg-yellow-100">
                  <AlertTriangle className="text-yellow-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Available</p>
                  <p className="text-2xl font-bold text-green-600">{formatNumber(totals.available)}</p>
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
                  <p className="text-2xl font-bold text-blue-600">{formatNumber(totals.allocated)}</p>
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
                  <p className="text-2xl font-bold text-purple-600">{formatNumber(totals.issued)}</p>
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
                  <p className="text-sm font-medium text-muted-foreground">Returned</p>
                  <p className="text-2xl font-bold text-gray-600">{formatNumber(totals.returned)}</p>
                </div>
                <div className="p-3 rounded-xl bg-gray-100">
                  <ArrowLeft className="text-gray-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Void</p>
                  <p className="text-2xl font-bold text-red-600">{formatNumber(totals.void)}</p>
                </div>
                <div className="p-3 rounded-xl bg-red-100">
                  <XCircle className="text-red-600 h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by category, stand, block..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex h-10 w-[200px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory Details ({inventory.length} pools)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Stand</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Gate</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead className="text-right">Face Value</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Void</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="secondary">{item.category}</Badge>
                      </TableCell>
                      <TableCell>{item.stand}</TableCell>
                      <TableCell>{item.block}</TableCell>
                      <TableCell>{item.gate}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={item.format === "DIGITAL" ? "bg-purple-100 text-purple-700" : ""}>
                          {item.format}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">₹{formatNumber(item.faceValue)}</TableCell>
                      <TableCell className="text-right font-medium">{formatNumber(item.total)}</TableCell>
                      <TableCell className="text-right text-yellow-600">{formatNumber(item.reserved)}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">{formatNumber(item.available)}</TableCell>
                      <TableCell className="text-right text-blue-600">{formatNumber(item.allocated)}</TableCell>
                      <TableCell className="text-right text-purple-600">{formatNumber(item.issued)}</TableCell>
                      <TableCell className="text-right text-gray-600">{formatNumber(item.returned)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatNumber(item.void)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/inventory/${item.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/inventory/${item.id}/edit`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Category Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Summary by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Total Stock</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat) => {
                    const catItems = inventory.filter(i => i.category === cat)
                    const catTotals = catItems.reduce((acc, item) => ({
                      total: acc.total + item.total,
                      reserved: acc.reserved + item.reserved,
                      available: acc.available + item.available,
                      allocated: acc.allocated + item.allocated,
                      issued: acc.issued + item.issued,
                    }), { total: 0, reserved: 0, available: 0, allocated: 0, issued: 0 })
                    const utilizationNum = catTotals.total > 0 ? ((catTotals.allocated + catTotals.issued) / catTotals.total * 100) : 0
                    const utilization = utilizationNum.toFixed(1)
                    return (
                      <TableRow key={cat}>
                        <TableCell><Badge variant="secondary">{cat}</Badge></TableCell>
                        <TableCell className="text-right">{formatNumber(catTotals.total)}</TableCell>
                        <TableCell className="text-right">{formatNumber(catTotals.reserved)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatNumber(catTotals.available)}</TableCell>
                        <TableCell className="text-right text-blue-600">{formatNumber(catTotals.allocated)}</TableCell>
                        <TableCell className="text-right text-purple-600">{formatNumber(catTotals.issued)}</TableCell>
                        <TableCell className="text-right font-medium">
                          <Badge variant={utilizationNum > 80 ? "destructive" : utilizationNum > 50 ? "default" : "success"}>
                            {utilization}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}

// Missing imports
import { Package, Truck, ArrowLeft, XCircle } from "lucide-react"