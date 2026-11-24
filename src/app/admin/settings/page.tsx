"use client"

import * as React from "react"
import { Save, Settings, Shield } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, TableSkeleton } from "@/components/operations/data-state"
import { useToast } from "@/hooks/use-toast"

interface Setting { id: string; key: string; value: string; category: string; description: string | null }
const labels: Record<string, string> = {
  "app.name": "Application name",
  "app.organization": "Organisation",
  "app.timezone": "Timezone",
  "security.session_timeout_hours": "Session timeout (hours)",
  "security.password_min_length": "Minimum password length",
}

export default function AdminSettingsPage() {
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()
  const [settings, setSettings] = React.useState<Setting[]>([])
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const canRead = Boolean(user?.permissions.includes("settings:read"))
  const canWrite = Boolean(user?.permissions.includes("settings:write"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch("/api/admin/settings", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { settings?: Setting[]; error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to load settings")
      const records = body.settings || []
      setSettings(records)
      setValues(Object.fromEntries(records.map((setting) => [setting.key, setting.value])))
      setError("")
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load settings") }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, sessionLoading, attempt])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: Object.entries(values).map(([key, value]) => ({ key, value })) }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to save settings")
      toast({ title: "Settings saved", description: "Application settings have been updated." })
      setAttempt((value) => value + 1)
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to save settings") } finally { setSaving(false) }
  }

  const general = settings.filter((setting) => setting.category === "General")
  const security = settings.filter((setting) => setting.category === "Security" && ["security.session_timeout_hours", "security.password_min_length"].includes(setting.key))
  return <MainLayout><div className="space-y-5">
    <PageHeader title="System settings" description="Application identity and supported security configuration." onRefresh={() => setAttempt((value) => value + 1)} refreshing={loading} />
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view settings.</p> : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
      <form onSubmit={save} className="space-y-5">
        <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Settings className="h-5 w-5" />General</CardTitle><CardDescription>Identity used by the application.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{general.map((setting) => <div key={setting.id} className="space-y-2"><Label htmlFor={setting.key}>{labels[setting.key] || setting.key}</Label><Input id={setting.key} value={values[setting.key] || ""} onChange={(event) => setValues({ ...values, [setting.key]: event.target.value })} disabled={!canWrite} /></div>)}</CardContent></Card>
        <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5" />Security</CardTitle><CardDescription>Sessions expire after 24 hours. Passwords require at least 16 characters for newly created users.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{security.map((setting) => <div key={setting.id} className="space-y-2"><Label htmlFor={setting.key}>{labels[setting.key] || setting.key}</Label><Input id={setting.key} value={values[setting.key] || ""} onChange={(event) => setValues({ ...values, [setting.key]: event.target.value })} disabled={!canWrite || setting.key === "security.session_timeout_hours"} /></div>)}</CardContent></Card>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {canWrite && <Button type="submit" disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save settings"}</Button>}
      </form>
      <Card className="border-dashed shadow-none"><CardHeader><CardTitle className="text-base">Integration status</CardTitle><CardDescription>SMTP, SMS, WhatsApp, MinIO, and MFA enrollment are not connected in this release. Contact your administrator before enabling them in production.</CardDescription></CardHeader></Card>
    </DataState>}
  </div></MainLayout>
}
