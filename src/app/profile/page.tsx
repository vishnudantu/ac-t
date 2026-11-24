"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Save, UserRound } from "lucide-react"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/operations/page-header"
import { useSession } from "@/hooks/use-session"
import { useToast } from "@/hooks/use-toast"

interface Profile {
  id: string
  email: string
  fullName: string
  mobileNumber: string | null
  designation: string | null
  department: string | null
  employeeId: string | null
}

const emptyProfile = { fullName: "", mobileNumber: "", designation: "", department: "" }
const emptyPassword = { currentPassword: "", newPassword: "", confirmPassword: "" }

async function readResponse(response: Response): Promise<{ error?: string; details?: { message: string }[] }> {
  try {
    return await response.json() as { error?: string; details?: { message: string }[] }
  } catch {
    return {}
  }
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: sessionLoading, refresh } = useSession()
  const { toast } = useToast()
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [form, setForm] = React.useState(emptyProfile)
  const [password, setPassword] = React.useState(emptyPassword)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [changing, setChanging] = React.useState(false)
  const [error, setError] = React.useState("")
  const [passwordError, setPasswordError] = React.useState("")

  React.useEffect(() => {
    if (sessionLoading || !user) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch("/api/account/profile", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { profile?: Profile; error?: string }
      if (!response.ok || !body.profile) throw new Error(body.error || "Unable to load your profile")
      setProfile(body.profile)
      setForm({
        fullName: body.profile.fullName,
        mobileNumber: body.profile.mobileNumber || "",
        designation: body.profile.designation || "",
        department: body.profile.department || "",
      })
      setError("")
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load your profile")
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [sessionLoading, user])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
      const body = await readResponse(response)
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to save your profile")
      await refresh()
      toast({ title: "Profile updated", description: "Your profile details have been saved." })
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile")
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.newPassword !== password.confirmPassword) {
      setPasswordError("New passwords do not match")
      return
    }
    setChanging(true)
    setPasswordError("")
    try {
      const response = await fetch("/api/account/password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(password),
      })
      const body = await readResponse(response)
      if (!response.ok) throw new Error(body.details?.[0]?.message || body.error || "Unable to change your password")
      setPassword(emptyPassword)
      toast({ title: "Password changed", description: "All sessions have been signed out. Sign in with your new password." })
      router.replace("/login")
      router.refresh()
    } catch (cause: unknown) {
      setPasswordError(cause instanceof Error ? cause.message : "Unable to change your password")
    } finally {
      setChanging(false)
    }
  }

  return <MainLayout><div className="mx-auto max-w-4xl space-y-5">
    <PageHeader eyebrow="Account" title="Profile & password" description="Update your personal details and keep your account secure." />
    <Card className="shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5" />Profile details</CardTitle><CardDescription>These details are visible to other staff in the operational record.</CardDescription></CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="profile-email">Email address</Label><Input id="profile-email" type="email" value={profile?.email || user?.email || ""} readOnly disabled /><p className="text-xs text-muted-foreground">Your sign-in email can only be changed by an administrator.</p></div>
            <div className="space-y-2"><Label htmlFor="profile-employee">Employee ID</Label><Input id="profile-employee" value={profile?.employeeId || "Not assigned"} readOnly disabled /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="profile-name">Full name</Label><Input id="profile-name" required minLength={2} maxLength={150} autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} disabled={loading || saving} /></div>
            <div className="space-y-2"><Label htmlFor="profile-mobile">Mobile number</Label><Input id="profile-mobile" type="tel" maxLength={30} autoComplete="tel" placeholder="+91 98765 43210" value={form.mobileNumber} onChange={(event) => setForm({ ...form, mobileNumber: event.target.value })} disabled={loading || saving} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="profile-designation">Designation</Label><Input id="profile-designation" maxLength={150} autoComplete="organization-title" value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} disabled={loading || saving} /></div>
            <div className="space-y-2"><Label htmlFor="profile-department">Department</Label><Input id="profile-department" maxLength={150} autoComplete="organization" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} disabled={loading || saving} /></div>
          </div>
          <Button type="submit" disabled={loading || !profile || saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save profile"}</Button>
        </form>
      </CardContent>
    </Card>

    <Card className="shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5" />Change password</CardTitle><CardDescription>Use at least 16 characters. Changing your password signs out every active session, including this one.</CardDescription></CardHeader>
      <CardContent>
        {passwordError && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{passwordError}</p>}
        <form onSubmit={changePassword} className="max-w-md space-y-4">
          <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" required autoComplete="current-password" maxLength={1024} value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} disabled={changing} /></div>
          <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" required minLength={16} maxLength={128} autoComplete="new-password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} disabled={changing} /><p className="text-xs text-muted-foreground">16–128 characters. Do not reuse your current password.</p></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" required minLength={16} maxLength={128} autoComplete="new-password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} disabled={changing} /></div>
          <Button type="submit" disabled={changing}>{changing ? "Changing…" : "Change password & sign out"}</Button>
        </form>
      </CardContent>
    </Card>
  </div></MainLayout>
}
