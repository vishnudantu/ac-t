"use client"

import * as React from "react"
import { Shield, Plus } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"

interface Permission { id: string; key: string; displayName: string; category: string }
interface Role { id: string; name: string; displayName: string; description: string | null; isSystem: boolean; permissions: { permission: { id: string; key: string; displayName: string } }[]; _count: { assignments: number } }

export default function AdminRolesPage() {
  const { user, loading: sessionLoading } = useSession()
  const [roles, setRoles] = React.useState<Role[]>([])
  const [permissions, setPermissions] = React.useState<Permission[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>([])
  const [attempt, setAttempt] = React.useState(0)
  const canRead = Boolean(user?.permissions.includes("roles:read"))
  const canWrite = Boolean(user?.permissions.includes("roles:write"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch("/api/admin/roles", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { roles?: Role[]; permissions?: Permission[]; error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to load roles")
      setRoles(body.roles || [])
      setPermissions(body.permissions || [])
      setError("")
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load roles") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, sessionLoading, attempt])

  async function createRole(event: React.FormEvent) {
    event.preventDefault()
    try {
      const response = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, displayName, description, permissionIds: selected }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to create role")
      setOpen(false)
      setName("")
      setDisplayName("")
      setDescription("")
      setSelected([])
      setAttempt((value) => value + 1)
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to create role") }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader title="Roles & permissions" description="Review system roles and create permission-based global roles." onRefresh={() => setAttempt((value) => value + 1)} refreshing={loading} actions={canWrite ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New role</Button> : undefined} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to manage roles.</p> : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
      {roles.length === 0 ? <Card><EmptyState icon={<Shield className="h-10 w-10" />} title="No roles configured" description="Roles will appear after they are created." /></Card> : <div className="grid gap-4 xl:grid-cols-2">{roles.map((role) => <Card key={role.id} className="shadow-none"><CardHeader><CardTitle className="flex items-center justify-between text-base"><span>{role.displayName}</span><Badge variant="secondary">{role._count.assignments} users</Badge></CardTitle><p className="font-mono text-xs text-muted-foreground">{role.name}</p></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{role.description || "No description provided."}</p><div className="flex flex-wrap gap-1.5">{role.permissions.map(({ permission }) => <Badge key={permission.id} variant="outline" className="text-xs">{permission.key}</Badge>)}</div>{role.isSystem && <p className="mt-4 text-xs text-muted-foreground">System role · permissions are managed by seed data.</p>}</CardContent></Card>)}</div>}
    </DataState>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Create role</DialogTitle><DialogDescription>Create a custom global role with explicitly selected permissions.</DialogDescription></DialogHeader><form onSubmit={createRole} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="role-name">Role identifier</Label><Input id="role-name" placeholder="EVENT_COORDINATOR" required pattern="[A-Z][A-Z0-9_]{2,60}" value={name} onChange={(event) => setName(event.target.value.toUpperCase())} /></div><div className="space-y-2"><Label htmlFor="role-display">Display name</Label><Input id="role-display" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="role-description">Description</Label><Textarea id="role-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div><fieldset><legend className="mb-2 text-sm font-medium">Permissions</legend><div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">{permissions.map((permission) => <label key={permission.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={selected.includes(permission.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, permission.id] : current.filter((id) => id !== permission.id))} /><span>{permission.displayName}<span className="block font-mono text-xs text-muted-foreground">{permission.key}</span></span></label>)}</div></fieldset><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!selected.length}>Create role</Button></DialogFooter></form></DialogContent></Dialog>
  </div></MainLayout>
}
