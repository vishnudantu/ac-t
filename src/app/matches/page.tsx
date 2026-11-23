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
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Copy,
  Trophy,
} from "lucide-react"
import { formatDate, formatStatus, getStatusColor } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import Link from "next/link"

const matches = [
  {
    id: "1",
    title: "India vs Australia - 2nd ODI",
    tournament: "Australia Tour of India 2026",
    format: "ODI",
    date: "2026-12-15",
    venue: "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium",
    status: "UPCOMING",
    requestsOpen: "2026-12-08",
    requestsClose: "2026-12-10",
    totalInventory: 38000,
    totalRequests: 1247,
    totalApproved: 28450,
  },
  {
    id: "2",
    title: "India vs England - 3rd Test",
    tournament: "England Tour of India 2026",
    format: "TEST",
    date: "2027-01-20",
    venue: "Indira Gandhi Municipal Stadium",
    status: "UPCOMING",
    requestsOpen: "2027-01-10",
    requestsClose: "2027-01-15",
    totalInventory: 25000,
    totalRequests: 0,
    totalApproved: 0,
  },
  {
    id: "3",
    title: "South Zone vs North Zone - Final",
    tournament: "Duleep Trophy 2026",
    format: "TOURNAMENT",
    date: "2026-11-10",
    venue: "Kurnool Cricket Stadium",
    status: "COMPLETED",
    requestsOpen: "2026-10-20",
    requestsClose: "2026-11-05",
    totalInventory: 20000,
    totalRequests: 892,
    totalApproved: 18200,
  },
  {
    id: "4",
    title: "Andhra vs Karnataka - Ranji Match",
    tournament: "Ranji Trophy 2026-27",
    format: "TEST",
    date: "2026-12-01",
    venue: "Tirupati Cricket Ground",
    status: "ACTIVE",
    requestsOpen: "2026-11-20",
    requestsClose: "2026-11-28",
    totalInventory: 15000,
    totalRequests: 456,
    totalApproved: 12100,
  },
]

export default function MatchesPage() {
  const { user, loading } = useSession()
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const filteredMatches = matches.filter((match) => {
    const matchesSearch = match.title.toLowerCase().includes(search.toLowerCase()) ||
      match.tournament.toLowerCase().includes(search.toLowerCase()) ||
      match.venue.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || match.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Matches</h1>
            <p className="text-muted-foreground">Manage cricket matches and events</p>
          </div>
          <Button asChild>
            <Link href="/matches/new">
              <Plus className="h-4 w-4 mr-2" />
              New Match
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
                  placeholder="Search matches, tournaments, venues..."
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
                  className="flex h-10 w-[180px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="all">All Status</option>
                  <option value="UPCOMING">Upcoming</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="POSTPONED">Postponed</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Matches Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Matches ({matches.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Match</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Date & Venue</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Request Period</TableHead>
                    <TableHead className="text-right">Inventory</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{match.title}</p>
                          <p className="text-sm text-muted-foreground">{match.tournament}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{match.format}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDate(match.date)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">{match.venue}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(match.status)}>
                          {formatStatus(match.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <p>{formatDate(match.requestsOpen)} - {formatDate(match.requestsClose)}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium">{match.totalInventory.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{match.totalRequests.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">{match.totalApproved.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/matches/${match.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/matches/${match.id}/edit`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/matches/${match.id}/clone`}>
                              <Copy className="h-4 w-4" />
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

        {filteredMatches.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No matches found</h3>
              <p className="mt-2 text-muted-foreground">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}