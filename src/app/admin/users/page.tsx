"use client"

import * as React from "react"
import { Plus, UserCog, KeyRound, Pencil, Trash2 } from "lucide-react"
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
import { useToast } from "@/hooks/use-toast"

interface Role { id: string; name: string; displayName: string }
interface User { id: string; email: string; fullName: string; designation: string | null; department: string | null; isActive: boolean; mfaEnabled: boolean; lastLoginAt: string | null; createdAt: string; roleAssignments: { role: Role }[] }
const initialForm = { fullName: "", email: "", password: "", roleId: "", designation: "", department: "" }

export default function AdminUsersPage() {
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()
  const [users, setUsers] = React.useState<User[]>([])
  const [roles, setRoles] = React.useState<Role[]>([])
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(initialForm)
  const [saving, setSaving] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [resetTarget, setResetTarget] = React.useState<User | null>(null)
  const [resetForm, setResetForm] = React.useState({ newPassword: "", confirmPassword: "" })
  const [resetting, setResetting] = React.useState(false)
  const [resetError, setResetError] = React.useState("")
  const [editTarget, setEditTarget] = React.useState<User | null>(null)
  const [editForm, setEditForm] = React.useState({ fullName: "", designation: "", department: "", roleId: "" })
  const [editError, setEditError] = React.useState("")
  const [deleting, setDeleting] = React.useState<User | null>(null)
  const [deleteError, setDeleteError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const canRead = Boolean(user?.permissions.includes("users:read"))
  const canCreateUser = Boolean(user?.permissions.includes("users:write") && user?.permissions.includes("users:assign_roles"))
  const canResetPassword = Boolean(user?.permissions.includes("users:write"))
  const canEdit = Boolean(user?.permissions.includes("users:write"))
  const canDelete = Boolean(user?.roles?.includes("SUPER_ADMIN"))

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

  function openEdit(target: User) {
    setEditTarget(target)
    setEditForm({ fullName: target.fullName, designation: target.designation || "", department: target.department || "", roleId: target.roleAssignments[0]?.role.id || "" })
    setEditError("")
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault()
    if (!editTarget) return
    setBusy(true)
    setEditError("")
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(editTarget.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: editForm.fullName, designation: editForm.designation || null, department: editForm.department || null, ...(editForm.roleId && editForm.roleId !== editTarget.roleAssignments[0]?.role.id ? { roleId: editForm.roleId } : {}) }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to update user")
      toast({ title: "User updated", description: editForm.fullName })
      setEditTarget(null)
      setAttempt((value) => value + 1)
    } catch (cause: unknown) { setEditError(cause instanceof Error ? cause.message : "Unable to update user") } finally { setBusy(false) }
  }

  async function toggleActive(target: User) {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !target.isActive }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to update user")
      toast({ title: target.isActive ? "User deactivated" : "User activated", description: target.fullName })
      setAttempt((value) => value + 1)
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to update user") } finally { setBusy(false) }
  }

  async function deleteUser() {
    if (!deleting) return
    setBusy(true)
    setDeleteError("")
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(deleting.id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to delete user")
      toast({ title: "User deleted", description: deleting.fullName })
      setDeleting(null)
      setAttempt((value) => value + 1)
    } catch (cause: unknown) { setDeleteError(cause instanceof Error ? cause.message : "Unable to delete user") } finally { setBusy(false) }
  }

  function openReset(target: User) {
    setResetTarget(target)
    setResetForm({ newPassword: "", confirmPassword: "" })
    setResetError("")
  }

  async function resetUserPassword(event: React.FormEvent) {
    event.preventDefault()
    if (!resetTarget) return
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setResetError("Passwords do not match")
      return
    }
    setResetting(true)
    setResetError("")
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(resetTarget.id)}/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: resetForm.newPassword }),
      })
      const body = await response.json() as { error?: string; details?: { message: string }[] }
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to reset password")
      toast({ title: "Password reset", description: `${resetTarget.fullName} has been signed out of all sessions.` })
      setResetTarget(null)
      setResetForm({ newPassword: "", confirmPassword: "" })
    } catch (cause: unknown) {
      setResetError(cause instanceof Error ? cause.message : "Unable to reset password")
    } finally {
      setResetting(false)
    }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader title="User management" description="Manage staff accounts and global role assignments." onRefresh={() => setAttempt((value) => value + 1)} refreshing={loading} actions={canCreateUser ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New user</Button> : undefined} />
    <Card className="shadow-none"><CardContent className="p-4"><SearchInput value={search} onChange={setSearch} label="Search users" placeholder="Search by name, email, designation, or department…" /></CardContent></Card>
    {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to manage users.</p> : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
      {filtered.length === 0 ? <Card><EmptyState icon={<UserCog className="h-10 w-10" />} title="No users found" description={search ? "No users match your search." : "Create the first staff account."} /></Card> : <Card className="shadow-none"><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Department</TableHead><TableHead>Roles</TableHead><TableHead>Status</TableHead><TableHead>Last login</TableHead><TableHead>Created</TableHead>{canEdit && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader><TableBody>{filtered.map((entry) => <TableRow key={entry.id}><TableCell><div className="font-medium">{entry.fullName}</div><div className="text-xs text-muted-foreground">{entry.email}</div><div className="text-xs">{entry.designation || "—"}</div></TableCell><TableCell>{entry.department || "—"}</TableCell><TableCell><div className="flex max-w-64 flex-wrap gap-1">{entry.roleAssignments.map(({ role }) => <Badge key={role.id} variant="secondary">{role.displayName}</Badge>)}</div></TableCell><TableCell><Badge variant={entry.isActive ? "default" : "secondary"}>{entry.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-xs">{entry.lastLoginAt ? formatDateTime(entry.lastLoginAt) : "Never"}</TableCell><TableCell className="text-xs">{formatDate(entry.createdAt)}</TableCell>{canEdit && <TableCell className="text-right"><div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${entry.fullName}`} onClick={() => openEdit(entry)}><Pencil className="h-4 w-4" /></Button>
                        {canResetPassword && <Button type="button" variant="ghost" size="icon" aria-label={`Reset password for ${entry.fullName}`} onClick={() => openReset(entry)}><KeyRound className="h-4 w-4" /></Button>}
                        <Button type="button" variant="ghost" size="sm" disabled={busy || entry.id === user?.userId} onClick={() => toggleActive(entry)}>{entry.isActive ? "Deactivate" : "Activate"}</Button>
                        {canDelete && <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${entry.fullName}`} disabled={busy || entry.id === user?.userId} onClick={() => { setDeleteError(""); setDeleting(entry) }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div></TableCell>}</TableRow>)}</TableBody></Table></Card>}
    </DataState>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Create user</DialogTitle><DialogDescription>Create a staff account with one global role. The password is used only for initial account setup.</DialogDescription></DialogHeader><form onSubmit={createUser} className="space-y-4"><div className="space-y-2"><Label htmlFor="user-name">Full name</Label><Input id="user-name" required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-email">Email</Label><Input id="user-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-password">Temporary password (minimum 8 characters)</Label><Input id="user-password" type="password" minLength={8} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-role">Global role</Label><select id="user-role" className={selectClassName} required value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}</select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="user-designation">Designation</Label><Input id="user-designation" value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="user-department">Department</Label><Input id="user-department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(resetTarget)} onOpenChange={(open) => { if (!open) setResetTarget(null) }}><DialogContent><DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>Set a new password for {resetTarget?.fullName}. Their existing sessions will be revoked; share the new password through a secure channel.</DialogDescription></DialogHeader><form onSubmit={resetUserPassword} className="space-y-4">{resetError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{resetError}</p>}<div className="space-y-2"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={resetForm.newPassword} onChange={(event) => setResetForm({ ...resetForm, newPassword: event.target.value })} disabled={resetting} /><p className="text-xs text-muted-foreground">At least 8 characters. Never reuse an existing password.</p></div><div className="space-y-2"><Label htmlFor="reset-confirm">Confirm new password</Label><Input id="reset-confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={resetForm.confirmPassword} onChange={(event) => setResetForm({ ...resetForm, confirmPassword: event.target.value })} disabled={resetting} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>Cancel</Button><Button type="submit" disabled={resetting}>{resetting ? "Resetting…" : "Reset password"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(editTarget)} onOpenChange={(open) => { if (!open && !busy) setEditTarget(null) }}><DialogContent><DialogHeader><DialogTitle>Edit user</DialogTitle><DialogDescription>Update {editTarget?.fullName}&apos;s details or global role.</DialogDescription></DialogHeader><form onSubmit={saveUser} className="space-y-4">{editError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{editError}</p>}<div className="space-y-2"><Label htmlFor="edit-name">Full name</Label><Input id="edit-name" required minLength={2} maxLength={150} value={editForm.fullName} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} disabled={busy} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="edit-designation">Designation</Label><Input id="edit-designation" maxLength={150} value={editForm.designation} onChange={(event) => setEditForm({ ...editForm, designation: event.target.value })} disabled={busy} /></div><div className="space-y-2"><Label htmlFor="edit-department">Department</Label><Input id="edit-department" maxLength={150} value={editForm.department} onChange={(event) => setEditForm({ ...editForm, department: event.target.value })} disabled={busy} /></div></div><div className="space-y-2"><Label htmlFor="edit-role">Global role</Label><select id="edit-role" className={selectClassName} value={editForm.roleId} onChange={(event) => setEditForm({ ...editForm, roleId: event.target.value })} disabled={busy}>{roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}</select></div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete user</DialogTitle><DialogDescription>Delete {deleting?.fullName}? Accounts with operational history cannot be deleted — deactivate them instead.</DialogDescription></DialogHeader>{deleteError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button><Button type="button" variant="destructive" onClick={deleteUser} disabled={busy}>{busy ? "Deleting…" : "Delete user"}</Button></DialogFooter></DialogContent></Dialog>
  </div></MainLayout>
}
