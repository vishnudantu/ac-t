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
  Plus,
  Eye,
  Edit,
  Key,
  MoreHorizontal,
  Users,
  X,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const roles = [
  {
    id: "1",
    name: "SUPER_ADMIN",
    displayName: "Super Administrator",
    description: "Full system administration, account management, match configuration and exceptional administrative controls",
    isSystem: true,
    permissions: 45,
    userCount: 1,
    createdAt: "2026-01-15",
  },
  {
    id: "2",
    name: "MATCH_ADMIN",
    displayName: "Match Administrator",
    description: "Creates matches, establishes ticket inventory, configures workflows and oversees match operations",
    isSystem: true,
    permissions: 28,
    userCount: 2,
    createdAt: "2026-01-15",
  },
  {
    id: "3",
    name: "REQUEST_DESK_OPERATOR",
    displayName: "Request Desk Operator",
    description: "Records incoming requests, uploads documents, manages requester details and tracks progress",
    isSystem: true,
    permissions: 8,
    userCount: 5,
    createdAt: "2026-01-15",
  },
  {
    id: "4",
    name: "DEPARTMENT_COORDINATOR",
    displayName: "Department Coordinator",
    description: "Manages requests belonging to a particular department or stakeholder group",
    isSystem: true,
    permissions: 12,
    userCount: 8,
    createdAt: "2026-01-15",
  },
  {
    id: "5",
    name: "APPROVAL_AUTHORITY",
    displayName: "Approval Authority",
    description: "Reviews requests, approves or rejects quantities, enters remarks and sends requests to higher authorities",
    isSystem: true,
    permissions: 15,
    userCount: 12,
    createdAt: "2026-01-15",
  },
  {
    id: "6",
    name: "QUOTA_CONTROLLER",
    displayName: "Quota Controller",
    description: "Manages a specific ticket quota and its permitted allocations",
    isSystem: true,
    permissions: 10,
    userCount: 6,
    createdAt: "2026-01-15",
  },
  {
    id: "7",
    name: "TICKET_ALLOCATION_OFFICER",
    displayName: "Ticket Allocation Officer",
    description: "Assigns approved ticket quantities to actual ticket categories, seat blocks or ticket numbers",
    isSystem: true,
    permissions: 18,
    userCount: 8,
    createdAt: "2026-01-15",
  },
  {
    id: "8",
    name: "DISTRIBUTION_OFFICER",
    displayName: "Distribution Officer",
    description: "Issues physical tickets, manages digital ticket delivery, captures collection acknowledgements and records returns",
    isSystem: true,
    permissions: 14,
    userCount: 10,
    createdAt: "2026-01-15",
  },
  {
    id: "9",
    name: "SENIOR_MANAGEMENT",
    displayName: "Senior Management",
    description: "Has a consolidated overview, can review escalated requests and can authorise exceptions",
    isSystem: true,
    permissions: 22,
    userCount: 3,
    createdAt: "2026-01-15",
  },
  {
    id: "10",
    name: "AUDITOR",
    displayName: "Auditor",
    description: "Read only access to history, approval records, ticket movement and reconciliation reports",
    isSystem: true,
    permissions: 16,
    userCount: 2,
    createdAt: "2026-01-15",
  },
]

const permissions = [
  { category: "User Management", perms: ["users:read", "users:write", "users:delete", "users:assign_roles"] },
  { category: "Role Management", perms: ["roles:read", "roles:write", "roles:delete"] },
  { category: "Match Management", perms: ["matches:read", "matches:write", "matches:delete", "matches:configure"] },
  { category: "Request Management", perms: ["requests:read", "requests:write", "requests:delete", "requests:assign", "requests:bulk_import", "requests:export"] },
  { category: "Approval Management", perms: ["approvals:read", "approvals:decide", "approvals:configure", "approvals:escalate"] },
  { category: "Inventory Management", perms: ["inventory:read", "inventory:write", "inventory:import", "inventory:adjust"] },
  { category: "Quota Management", perms: ["quotas:read", "quotas:write", "quotas:transfer"] },
  { category: "Allocation Management", perms: ["allocations:read", "allocations:write", "allocations:confirm", "allocations:committee"] },
  { category: "Distribution Management", perms: ["distribution:read", "distribution:write", "distribution:issue", "distribution:handover", "distribution:return"] },
  { category: "Reports", perms: ["reports:read", "reports:export", "reports:reconciliation"] },
  { category: "Audit", perms: ["audit:read", "audit:export"] },
  { category: "System Settings", perms: ["settings:read", "settings:write"] },
  { category: "Notifications", perms: ["notifications:read", "notifications:send", "notifications:configure"] },
]

// Role permissions mapping (which role has which permissions)
const rolePermissions: Record<string, string[]> = {
  SUPER_ADMIN: permissions.flatMap(c => c.perms),
  MATCH_ADMIN: [
    "matches:read", "matches:write", "matches:configure",
    "requests:read", "requests:write", "requests:assign", "requests:bulk_import", "requests:export",
    "approvals:read", "approvals:configure",
    "inventory:read", "inventory:write", "inventory:import", "inventory:adjust",
    "quotas:read", "quotas:write", "quotas:transfer",
    "allocations:read", "allocations:write", "allocations:confirm", "allocations:committee",
    "distribution:read", "distribution:write", "distribution:issue", "distribution:handover", "distribution:return",
    "reports:read", "reports:export", "reports:reconciliation",
    "audit:read", "audit:export",
    "settings:read", "settings:write",
    "notifications:read", "notifications:send", "notifications:configure",
  ],
  REQUEST_DESK_OPERATOR: [
    "requests:read", "requests:write", "requests:assign", "requests:bulk_import", "requests:export",
    "users:read",
    "reports:read",
  ],
  DEPARTMENT_COORDINATOR: [
    "requests:read", "requests:write", "requests:export",
    "approvals:read",
    "reports:read",
  ],
  APPROVAL_AUTHORITY: [
    "requests:read",
    "approvals:read", "approvals:decide", "approvals:escalate",
    "reports:read",
  ],
  QUOTA_CONTROLLER: [
    "quotas:read", "quotas:write", "quotas:transfer",
    "inventory:read",
    "allocations:read",
    "reports:read",
  ],
  TICKET_ALLOCATION_OFFICER: [
    "requests:read",
    "approvals:read",
    "inventory:read",
    "quotas:read",
    "allocations:read", "allocations:write", "allocations:confirm", "allocations:committee",
    "reports:read",
  ],
  DISTRIBUTION_OFFICER: [
    "requests:read",
    "allocations:read",
    "distribution:read", "distribution:write", "distribution:issue", "distribution:handover", "distribution:return",
    "reports:read",
  ],
  SENIOR_MANAGEMENT: [
    "matches:read",
    "requests:read", "requests:export",
    "approvals:read", "approvals:decide", "approvals:escalate",
    "inventory:read",
    "quotas:read",
    "allocations:read",
    "distribution:read",
    "reports:read", "reports:export", "reports:reconciliation",
    "audit:read",
  ],
  AUDITOR: [
    "matches:read",
    "requests:read",
    "approvals:read",
    "inventory:read",
    "quotas:read",
    "allocations:read",
    "distribution:read",
    "reports:read", "reports:export", "reports:reconciliation",
    "audit:read", "audit:export",
  ],
}

export default function AdminRolesPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("roles")
  const [selectedRole, setSelectedRole] = React.useState<typeof roles[0] | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const handleViewPermissions = (role: typeof roles[0]) => {
    setSelectedRole(role)
    setDetailOpen(true)
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
            <p className="text-muted-foreground">Manage system roles and access control</p>
          </div>
          <Button asChild>
            <Link href="/admin/roles/new">
              <Plus className="h-4 w-4 mr-2" />
              New Role
            </Link>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="roles">Roles ({roles.length})</TabsTrigger>
            <TabsTrigger value="permissions">All Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <Card>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>System</TableHead>
                        <TableHead className="text-right">Permissions</TableHead>
                        <TableHead className="text-right">Users</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((role) => (
                        <TableRow key={role.id}>
                          <TableCell className="font-medium">{role.displayName}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[300px] truncate">{role.description}</TableCell>
                          <TableCell>
                            {role.isSystem ? (
                              <Badge variant="secondary">System</Badge>
                            ) : (
                              <Badge variant="outline">Custom</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">{role.permissions}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{role.userCount}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(role.createdAt)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{role.displayName}</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleViewPermissions(role)}>
                                  <Key className="h-4 w-4 mr-2" />
                                  View Permissions
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/roles/${role.id}/edit`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Role
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/roles/${role.id}/users`}>
                                    <Users className="h-4 w-4 mr-2" />
                                    Manage Users
                                  </Link>
                                </DropdownMenuItem>
                                {!role.isSystem && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive">Delete Role</DropdownMenuItem>
                                  </>
                                )}
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

          <TabsContent value="permissions">
            <Card>
              <CardHeader>
                <CardTitle>All System Permissions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {permissions.map((cat) => (
                    <div key={cat.category}>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-3">{cat.category}</h4>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {cat.perms.map((perm) => (
                          <div key={perm} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                            <Badge variant="outline">{perm}</Badge>
                            <span className="text-sm text-muted-foreground flex-1">
                              {perm.split(":")[1]?.replace("_", " ") || perm}
                            </span>
                            <div className="flex items-center gap-1 text-xs">
                              {roles.filter(r => rolePermissions[r.name]?.includes(perm)).map(r => (
                                <Badge key={r.name} variant="secondary" className="text-xs">{r.displayName}</Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Permission Detail Dialog */}
        {detailOpen && selectedRole && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetailOpen(false)}>
            <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold">{selectedRole.displayName} Permissions</h2>
                <Button variant="ghost" size="icon" onClick={() => setDetailOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <p className="text-sm text-muted-foreground mb-4">{selectedRole.description}</p>
                {permissions.map((cat) => {
                  const catPerms = cat.perms.filter(p => rolePermissions[selectedRole.name]?.includes(p))
                  if (catPerms.length === 0) return null
                  return (
                    <div key={cat.category} className="mb-6">
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">{cat.category}</h4>
                      <div className="flex flex-wrap gap-2">
                        {catPerms.map((perm) => (
                          <Badge key={perm} variant="default" className="gap-1">
                            <Key className="h-3 w-3" />
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
