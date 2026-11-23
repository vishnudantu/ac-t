"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Users,
  Search,
  Filter,
  Plus,
  Eye,
  Edit,
  Download,
  Upload,
  Building,
  Phone,
  Mail,
} from "lucide-react"
import { formatDate, formatPhone } from "@/lib/utils"
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

const requesters = [
  {
    id: "1",
    name: "Dr. S. Ramesh",
    mobile: "+919876500001",
    email: "ramesh@aca.gov.in",
    designation: "President",
    organization: "Andhra Cricket Association",
    category: "VIP",
    protocolLevel: 1,
    verified: true,
    totalRequests: 12,
    totalTickets: 450,
    lastRequest: "2026-11-20",
    status: "ACTIVE",
  },
  {
    id: "2",
    name: "Mr. K. Venkatesh",
    mobile: "+919876500002",
    email: "venkatesh@aca.gov.in",
    designation: "Secretary",
    organization: "Andhra Cricket Association",
    category: "VIP",
    protocolLevel: 2,
    verified: true,
    totalRequests: 8,
    totalTickets: 320,
    lastRequest: "2026-11-20",
    status: "ACTIVE",
  },
  {
    id: "3",
    name: "Mr. P. Suresh",
    mobile: "+919876500003",
    email: "suresh@aca.gov.in",
    designation: "Joint Secretary",
    organization: "Andhra Cricket Association",
    category: "OFFICIAL",
    protocolLevel: 3,
    verified: true,
    totalRequests: 15,
    totalTickets: 580,
    lastRequest: "2026-11-15",
    status: "ACTIVE",
  },
  {
    id: "4",
    name: "Ms. L. Padmaja",
    mobile: "+919876500004",
    email: "padmaja@bcci.tv",
    designation: "GM - Operations",
    organization: "BCCI",
    category: "BCCI",
    protocolLevel: 2,
    verified: true,
    totalRequests: 6,
    totalTickets: 280,
    lastRequest: "2026-11-19",
    status: "ACTIVE",
  },
  {
    id: "5",
    name: "Mr. R. Subrahmanyam",
    mobile: "+919876500005",
    email: "subrahmanyam@gov.ap.in",
    designation: "Chief Secretary",
    organization: "Government of Andhra Pradesh",
    category: "GOVERNMENT",
    protocolLevel: 1,
    verified: true,
    totalRequests: 4,
    totalTickets: 180,
    lastRequest: "2026-11-10",
    status: "ACTIVE",
  },
  {
    id: "6",
    name: "Mr. V. Ravi Kumar",
    mobile: "+919876500006",
    email: "ravi@vdca.in",
    designation: "President",
    organization: "Visakhapatnam DCA",
    category: "OFFICIAL",
    protocolLevel: 4,
    verified: true,
    totalRequests: 22,
    totalTickets: 1200,
    lastRequest: "2026-11-19",
    status: "ACTIVE",
  },
  {
    id: "7",
    name: "Mr. M. Rajesh",
    mobile: "+919876500007",
    email: "rajesh@ril.com",
    designation: "VP - Sports",
    organization: "Reliance Industries Limited",
    category: "SPONSOR",
    protocolLevel: 3,
    verified: true,
    totalRequests: 5,
    totalTickets: 220,
    lastRequest: "2026-11-18",
    status: "ACTIVE",
  },
  {
    id: "8",
    name: "Ms. A. Priya",
    mobile: "+919876500008",
    email: "priya@starsports.com",
    designation: "Senior Producer",
    organization: "Star Sports",
    category: "MEDIA",
    protocolLevel: 4,
    verified: true,
    totalRequests: 3,
    totalTickets: 85,
    lastRequest: "2026-11-18",
    status: "ACTIVE",
  },
  {
    id: "9",
    name: "Mr. G. Krishna",
    mobile: "+919876500009",
    email: "krishna@member.aca.in",
    designation: "Life Member",
    organization: "Andhra Cricket Association",
    category: "MEMBER",
    protocolLevel: 5,
    verified: false,
    totalRequests: 18,
    totalTickets: 720,
    lastRequest: "2026-11-17",
    status: "ACTIVE",
  },
  {
    id: "10",
    name: "Ms. S. Lakshmi",
    mobile: "+919876500010",
    email: "lakshmi@stadium.ap.gov.in",
    designation: "Stadium Manager",
    organization: "Andhra Cricket Association",
    category: "STAFF",
    protocolLevel: 5,
    verified: true,
    totalRequests: 10,
    totalTickets: 380,
    lastRequest: "2026-11-17",
    status: "ACTIVE",
  },
]

export default function RequestersPage() {
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

  const categories = [...new Set(requesters.map(r => r.category))]
  const filteredRequesters = requesters.filter((req) => {
    const matchesSearch = req.name.toLowerCase().includes(search.toLowerCase()) ||
      req.mobile.includes(search.replace(/\D/g, '')) ||
      req.email?.toLowerCase().includes(search.toLowerCase()) ||
      req.organization.toLowerCase().includes(search.toLowerCase()) ||
      req.designation.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === "all" || req.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Requesters</h1>
            <p className="text-muted-foreground">Manage requester directory and history</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/requesters/import">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/requesters/export">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Link>
            </Button>
            <Button asChild>
              <Link href="/requesters/new">
                <Plus className="h-4 w-4 mr-2" />
                New Requester
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
                  placeholder="Search by name, phone, email, organization..."
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

        {/* Requesters Table */}
        <Card>
          <CardHeader>
            <CardTitle>Requester Directory ({requesters.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead className="text-right">Total Requests</TableHead>
                    <TableHead className="text-right">Total Tickets</TableHead>
                    <TableHead>Last Request</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequesters.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{formatPhone(req.mobile)}</span>
                          </div>
                          {req.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground truncate max-w-[200px]">{req.email}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{req.designation}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Building className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate max-w-[150px]">{req.organization}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{req.category}</Badge></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={req.protocolLevel <= 2 ? "bg-red-50 text-red-700" : req.protocolLevel <= 3 ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700"}>
                          Level {req.protocolLevel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {req.verified ? (
                          <Badge variant="success">Verified</Badge>
                        ) : (
                          <Badge variant="warning">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{req.totalRequests}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">{req.totalTickets}</TableCell>
                      <TableCell className="text-muted-foreground">{req.lastRequest !== "Never" ? formatDate(req.lastRequest) : "Never"}</TableCell>
                      <TableCell>
                        <Badge variant={req.status === "ACTIVE" ? "success" : "secondary"}>
                          {req.status}
                        </Badge>
                      </TableCell>
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
                              <Link href={`/requesters/${req.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Profile
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/requesters/${req.id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/requests/new?requester=${req.id}`}>
                                <Plus className="h-4 w-4 mr-2" />
                                New Request
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>View History</DropdownMenuItem>
                            <DropdownMenuItem>Merge Duplicates</DropdownMenuItem>
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

        {filteredRequesters.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No requesters found</h3>
              <p className="mt-2 text-muted-foreground">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}

import { MoreHorizontal } from "lucide-react"