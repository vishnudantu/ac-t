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
  Plus,
  Eye,
  Edit,
  Shield,
  Key,
  MoreHorizontal,
} from "lucide-react"
import { formatDate } from "@/lib/utils"
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

const users = [
  {
    id: "1",
    name: "System Administrator",
    email: "admin@aca.gov.in",
    mobile: "+919876543210",
    designation: "Super Administrator",
    department: "IT Administration",
    employeeId: "ACA-ADMIN-001",
    roles: ["SUPER_ADMIN"],
    isActive: true,
    mfaEnabled: true,
    lastLogin: "2026-11-20T10:00:00",
    createdAt: "2026-01-15",
  },
  {
    id: "2",
    name: "John Doe",
    email: "john.doe@aca.gov.in",
    mobile: "+919876543211",
    designation: "Match Administrator",
    department: "Operations",
    employeeId: "ACA-OPS-001",
    roles: ["MATCH_ADMIN"],
    isActive: true,
    mfaEnabled: true,
    lastLogin: "2026-11-20T09:30:00",
    createdAt: "2026-02-01",
  },
  {
    id: "3",
    name: "Jane Smith",
    email: "jane.smith@aca.gov.in",
    mobile: "+919876543212",
    designation: "Request Desk Operator",
    department: "Request Desk",
    employeeId: "ACA-RD-001",
    roles: ["REQUEST_DESK_OPERATOR"],
    isActive: true,
    mfaEnabled: false,
    lastLogin: "2026-11-20T08:45:00",
    createdAt: "2026-02-15",
  },
  {
    id: "4",
    name: "Robert Wilson",
    email: "robert.wilson@aca.gov.in",
    mobile: "+919876543213",
    designation: "Department Coordinator",
    department: "ACA Officials",
    employeeId: "ACA-DC-001",
    roles: ["DEPARTMENT_COORDINATOR"],
    isActive: true,
    mfaEnabled: false,
    lastLogin: "2026-11-19T17:00:00",
    createdAt: "2026-03-01",
  },
  {
    id: "5",
    name: "Sarah Johnson",
    email: "sarah.johnson@aca.gov.in",
    mobile: "+919876543214",
    designation: "Approval Authority",
    department: "Protocol",
    employeeId: "ACA-AA-001",
    roles: ["APPROVAL_AUTHORITY"],
    isActive: true,
    mfaEnabled: true,
    lastLogin: "2026-11-20T10:15:00",
    createdAt: "2026-03-15",
  },
  {
    id: "6",
    name: "Michael Brown",
    email: "michael.brown@aca.gov.in",
    mobile: "+919876543215",
    designation: "Quota Controller",
    department: "Quota Management",
    employeeId: "ACA-QC-001",
    roles: ["QUOTA_CONTROLLER"],
    isActive: true,
    mfaEnabled: false,
    lastLogin: "2026-11-19T16:30:00",
    createdAt: "2026-04-01",
  },
  {
    id: "7",
    name: "Emily Davis",
    email: "emily.davis@aca.gov.in",
    mobile: "+919876543216",
    designation: "Allocation Officer",
    department: "Allocations",
    employeeId: "ACA-AO-001",
    roles: ["TICKET_ALLOCATION_OFFICER"],
    isActive: true,
    mfaEnabled: false,
    lastLogin: "2026-11-20T09:00:00",
    createdAt: "2026-04-15",
  },
  {
    id: "8",
    name: "David Miller",
    email: "david.miller@aca.gov.in",
    mobile: "+919876543217",
    designation: "Distribution Officer",
    department: "Distribution",
    employeeId: "ACA-DO-001",
    roles: ["DISTRIBUTION_OFFICER"],
    isActive: true,
    mfaEnabled: false,
    lastLogin: "2026-11-20T08:30:00",
    createdAt: "2026-05-01",
  },
]

const roles = [
  { name: "SUPER_ADMIN", displayName: "Super Administrator" },
  { name: "MATCH_ADMIN", displayName: "Match Administrator" },
  { name: "REQUEST_DESK_OPERATOR", displayName: "Request Desk Operator" },
  { name: "DEPARTMENT_COORDINATOR", displayName: "Department Coordinator" },
  { name: "APPROVAL_AUTHORITY", displayName: "Approval Authority" },
  { name: "QUOTA_CONTROLLER", displayName: "Quota Controller" },
  { name: "TICKET_ALLOCATION_OFFICER", displayName: "Ticket Allocation Officer" },
  { name: "DISTRIBUTION_OFFICER", displayName: "Distribution Officer" },
  { name: "SENIOR_MANAGEMENT", displayName: "Senior Management" },
  { name: "AUDITOR", displayName: "Auditor" },
]

export default function AdminUsersPage() {
  const { user, loading } = useSession()
  const [search, setSearch] = React.useState("")
  const [roleFilter, setRoleFilter] = React.useState("all")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.designation.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === "all" || u.roles.includes(roleFilter)
    return matchesSearch && matchesRole
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">Manage system users and access</p>
          </div>
          <Button asChild>
            <Link href="/admin/users/new">
              <Plus className="h-4 w-4 mr-2" />
              New User
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
                  placeholder="Search by name, email, designation..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="flex h-10 w-[220px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Roles</option>
                {roles.map(r => <option key={r.name} value={r.name}>{r.displayName}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Users ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>MFA</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.designation}</TableCell>
                      <TableCell>{u.department}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((role) => {
                            const roleInfo = roles.find(r => r.name === role)
                            return <Badge key={role} variant="secondary">{roleInfo?.displayName || role}</Badge>
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? "success" : "secondary"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.mfaEnabled ? "success" : "warning"}>
                          {u.mfaEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(u.lastLogin)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(u.createdAt)}</TableCell>
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
                              <Link href={`/admin/users/${u.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/users/${u.id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Shield className="h-4 w-4 mr-2" />
                              Manage Roles
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Key className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              {u.isActive ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
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
      </div>
    </MainLayout>
  )
}

