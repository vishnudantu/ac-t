"use client"

import * as React from "react"
import { Mail, MessageSquare, Plug, Save, Smartphone, Webhook } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, TableSkeleton } from "@/components/operations/data-state"
import { useToast } from "@/hooks/use-toast"

type Values = Record<string, string>

const fields: { section: string; icon: React.ReactNode; description: string; fields: { key: string; label: string; type?: string; placeholder?: string }[] }[] = [
  {
    section: "Email (SMTP)", icon: <Mail className="h-5 w-5" />, description: "Send request and approval notifications by email.",
    fields: [
      { key: "integration.email.enabled", label: "Enable email (true/false)", placeholder: "false" },
      { key: "integration.smtp.host", label: "SMTP host", placeholder: "smtp.example.com" },
      { key: "integration.smtp.port", label: "SMTP port", placeholder: "587" },
      { key: "integration.smtp.secure", label: "Use TLS from connect (true/false)", placeholder: "false" },
      { key: "integration.smtp.user", label: "SMTP username" },
      { key: "integration.smtp.password", label: "SMTP password", type: "password", placeholder: "Leave blank to keep current" },
      { key: "integration.smtp.from", label: "From address", placeholder: "tickets@example.com" },
    ],
  },
  {
    section: "SMS & WhatsApp (Twilio)", icon: <Smartphone className="h-5 w-5" />, description: "Send SMS and WhatsApp alerts through Twilio.",
    fields: [
      { key: "integration.sms.enabled", label: "Enable SMS (true/false)", placeholder: "false" },
      { key: "integration.whatsapp.enabled", label: "Enable WhatsApp (true/false)", placeholder: "false" },
      { key: "integration.twilio.account_sid", label: "Twilio Account SID" },
      { key: "integration.twilio.auth_token", label: "Twilio auth token", type: "password", placeholder: "Leave blank to keep current" },
      { key: "integration.twilio.from", label: "Twilio from number", placeholder: "+1… or whatsapp:+1…" },
    ],
  },
  {
    section: "District by Zomato", icon: <Webhook className="h-5 w-5" />, description: "Partner webhook for real-time ticket sales. Dry-run until live is enabled.",
    fields: [
      { key: "integration.district.webhook_secret", label: "Webhook shared secret", type: "password", placeholder: "Leave blank to keep current" },
      { key: "integration.district.live", label: "Live mode (true/false)", placeholder: "false" },
    ],
  },
]

export default function IntegrationsPage() {
  const { user, loading: sessionLoading } = useSession()
  const { toast } = useToast()
  const [values, setValues] = React.useState<Values>({})
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const canRead = Boolean(user?.permissions.includes("settings:read"))
  const canWrite = Boolean(user?.permissions.includes("settings:write"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    fetch("/api/admin/integrations", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { values?: Values; error?: string }
        if (!response.ok) throw new Error(body.error || "Unable to load integrations")
        setValues(body.values || {})
        setError("")
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load integrations"))
      .finally(() => setLoading(false))
  }, [canRead, sessionLoading])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/admin/integrations", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to save integrations")
      toast({ title: "Integrations saved", description: "Provider settings have been updated." })
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to save integrations")
    } finally {
      setSaving(false)
    }
  }

  return <MainLayout><div className="mx-auto max-w-4xl space-y-5">
    <PageHeader
      eyebrow="Administration"
      title="Integrations"
      description="Configure email, SMS, WhatsApp and partner ticket sales. Secrets are masked; leave a secret field blank to keep its current value."
    />
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to manage integrations.</p>
      : <DataState loading={loading} error={error} onRetry={() => window.location.reload()} skeleton={<Card><TableSkeleton /></Card>}>
        <form onSubmit={save} className="space-y-5">
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {fields.map((section) => <Card key={section.section} className="shadow-none">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg">{section.icon}{section.section}</CardTitle><CardDescription>{section.description}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.type || "text"}
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  placeholder={field.placeholder}
                  disabled={!canWrite || saving}
                  autoComplete="off"
                />
              </div>)}
            </CardContent>
          </Card>)}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canWrite || saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save integrations"}</Button>
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Plug className="h-4 w-4" />Enable channels only after validating them in dry-run mode.</p>
          </div>
        </form>
      </DataState>}
  </div></MainLayout>
}
