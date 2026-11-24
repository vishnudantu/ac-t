"use client"

import * as React from "react"
import { Plus, UserCog } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { selectClassName } from "@/components/lifecycle/client"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { SearchInput } from "@/components/operations/list-controls"
import { formatDate, formatDateTime } from "@/lib/utils"

interface Role { id: string; name: string; displayName: string }
interface User { id: string; email: string; fullName: string; designation: string | null; department: string | null; isActive: boolean; mfaEnabled: boolean; lastLoginAt: string | null; createdAt: string; roleAssignments: { role: Role }[] }
const initialForm = { fullName: "", email: "", password: "", roleId: "", designation: "", department: "" }

export default function AdminUsersPage() {
  const { user, loading: sessionLoading } = useSession()
  const [users, setUsers] = React.useState<User[]>([])
  const [roles, setRoles] = React.useState<Role[]>([])
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(initialForm)
  const [saving, setSaving] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const canRead = Boolean(user?.permissions.includes("users:read"))
  const canWrite = Boolean(user?.permissions.includes("users:write") && user?.permissions.includes("users:assign_roles"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch("/api/admin/users", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { users?: User[]; roles?: Role[]; error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to load users")
      setUsers(body.users || [])
      setRoles(body.roles || [])
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load users") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, sessionLoading, attempt])

  const filtered = users.filter((entry) => [entry.fullName, entry.email, entry.designation, entry.department].some((value) => value?.toLowerCase().includes(search.toLowerCase())))

  async function createUser(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to create user")
      setOpen(false)
      setForm(initialForm)
      setAttempt((value) => value + 1)
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to create user") } finally { setSaving(false) }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader title="User management" description="Manage staff accounts and global role assignments." onRefresh={() => setAttempt((value) => value + 1)} refreshing={loading} actions={canWrite ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New user</Button> : undefined} />
    <Card className="shadow-none"><CardContent className="p-4"><SearchInput value={search} onChange={setSearch} label="Search users" placeholder="Search by name, email, designation, or department…" /></CardContent></Card>
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to manage users.</p> : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
      {filtered.length === 0 ? <Card><EmptyState icon={<UserCog className="h-10 w-10" />} title="No users found" description={search ? "No users match your search." : "Create the first staff account."} /></Card> : <Card className="shadow-none"><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Department</TableHead><TableHead>Roles</TableHead><TableHead>Status</TableHead><TableHead>Last login</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{filtered.map((entry) => <TableRow key={entry.id}><TableCell><div className="font-medium">{entry.fullName}</div><div className="text-xs text-muted-foreground">{entry.email}</div><div className="text-xs">{entry.designation || "—"}</div></TableCell><TableCell>{entry.department || "—"}</TableCell><TableCell><div className="flex max-w-64 flex-wrap gap-1">{entry.roleAssignments.map(({ role }) => <Badge key={role.id} variant="secondary">{role.displayName}</Badge>)}</div></TableCell><TableCell><Badge variant={entry.isActive ? "default" : "secondary"}>{entry.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-xs">{entry.lastLoginAt ? formatDateTime(entry.lastLoginAt) : "Never"}</TableCell><TableCell className="text-xs">{formatDate(entry.createdAt)}</TableCell></TableRow>)}</TableBody></Table></Card>}
    </DataState>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Create user</DialogTitle><DialogDescription>Create a staff account with one global role. The password is used only for initial account setup.</DialogDescription></DialogHeader><form onSubmit={createUser} className="space-y-4"><div className="space-y-2"><Label htmlFor="user-name">Full name</Label><Input id="user-name" required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-email">Email</Label><Input id="user-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-password">Temporary password (minimum 16 characters)</Label><Input id="user-password" type="password" minLength={16} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-role">Global role</Label><select id="user-role" className={selectClassName} required value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}</select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="user-designation">Designation</Label><Input id="user-designation" value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-department">Department</Label><Input id="user-department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div></MainLayout>
}
