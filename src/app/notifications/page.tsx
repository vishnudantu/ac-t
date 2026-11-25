"use client"

import * as React from "react"
import { Bell, Mail, MessageSquare, Smartphone, Send } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect } from "@/components/operations/list-controls"
import { formatDateTime, formatStatus } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface NotificationLog {
  id: string
  channel: string
  subject: string | null
  body: string
  status: string
  errorMessage: string | null
  sentAt: string | null
  createdAt: string
  recipient: { id: string; fullName: string; email: string | null; mobileNumber: string | null }
}

export default function NotificationsPage() {
  const { user, loading: sessionLoading } = useSession()
  const [logs, setLogs] = React.useState<NotificationLog[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [channel, setChannel] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [attempt, setAttempt] = React.useState(0)
  const [testOpen, setTestOpen] = React.useState(false)
  const [testChannel, setTestChannel] = React.useState<"EMAIL" | "SMS" | "WHATSAPP">("EMAIL")
  const [testSaving, setTestSaving] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ status: string; errorMessage: string | null } | null>(null)
  const canRead = Boolean(user?.permissions.includes("notifications:read"))
  const canSend = Boolean(user?.permissions.includes("notifications:send"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (channel) params.set("channel", channel)
    if (status) params.set("status", status)
    fetch(`/api/notifications?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { logs?: NotificationLog[]; error?: string }
        if (!response.ok) throw new Error(body.error || "Unable to load notifications")
        setLogs(body.logs || [])
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load notifications") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, sessionLoading, channel, status, attempt])

  async function sendTest() {
    setTestSaving(true)
    setTestResult(null)
    try {
      const response = await fetch("/api/notifications/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: testChannel }) })
      const body = await response.json() as { status?: string; errorMessage?: string | null; error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to send test")
      setTestResult({ status: body.status ?? "UNKNOWN", errorMessage: body.errorMessage ?? null })
      setAttempt((value) => value + 1)
    } catch (cause: unknown) {
      setTestResult({ status: "FAILED", errorMessage: cause instanceof Error ? cause.message : "Unable to send test" })
    } finally {
      setTestSaving(false)
    }
  }

  return <MainLayout><div className="space-y-5">
    <PageHeader
      title="Notifications"
      description="Delivery log for email, SMS and WhatsApp. Channels activate once SMTP or Twilio is configured."
      onRefresh={() => setAttempt((value) => value + 1)}
      refreshing={loading}
      actions={canSend ? <Button size="sm" variant="outline" onClick={() => { setTestResult(null); setTestOpen(true) }}><Send className="mr-2 h-4 w-4" />Send test</Button> : undefined}
    />
    <Card className="shadow-none"><CardContent className="grid gap-3 p-4 sm:grid-cols-2">
      <FilterSelect value={channel} onChange={setChannel} label="Channel" options={[{ value: "", label: "All channels" }, { value: "EMAIL", label: "Email" }, { value: "SMS", label: "SMS" }, { value: "WHATSAPP", label: "WhatsApp" }]} />
      <FilterSelect value={status} onChange={setStatus} label="Status" options={[{ value: "", label: "All statuses" }, { value: "PENDING", label: "Pending" }, { value: "SENT", label: "Sent" }, { value: "FAILED", label: "Failed" }, { value: "SKIPPED", label: "Skipped" }]} />
    </CardContent></Card>
    {!sessionLoading && !canRead ? <p role="alert" className="text-destructive">Your account does not have permission to view notifications.</p>
      : <DataState loading={loading} error={error} onRetry={() => setAttempt((value) => value + 1)} skeleton={<Card><TableSkeleton /></Card>}>
        {logs.length === 0 ? <Card><EmptyState icon={<Bell className="h-10 w-10" />} title="No notifications yet" description="Notifications appear here after requests are submitted, approved, or issued. Delivery requires SMTP or Twilio configuration." /></Card>
          : <Card className="shadow-none"><CardHeader className="p-4 pb-3"><CardTitle className="text-lg">Delivery log</CardTitle></CardHeader><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Channel</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Sent</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
            <TableBody>{logs.map((log) => <TableRow key={log.id}>
              <TableCell><p className="font-medium">{log.recipient.fullName}</p><p className="text-xs text-muted-foreground">{log.recipient.email || log.recipient.mobileNumber}</p></TableCell>
              <TableCell><Badge variant="secondary">{log.channel === 'EMAIL' ? <Mail className="mr-1 h-3 w-3" /> : log.channel === 'SMS' ? <Smartphone className="mr-1 h-3 w-3" /> : <MessageSquare className="mr-1 h-3 w-3" />}{formatStatus(log.channel)}</Badge></TableCell>
              <TableCell className="max-w-64 truncate text-sm">{log.subject || log.body}</TableCell>
              <TableCell><Badge className={log.status === 'SENT' ? 'status-approved' : log.status === 'FAILED' ? 'status-closed' : ''}>{log.status}</Badge></TableCell>
              <TableCell className="whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{log.sentAt ? formatDateTime(log.sentAt) : "—"}</TableCell>
              <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{log.errorMessage || "—"}</TableCell>
            </TableRow>)}</TableBody>
          </Table></CardContent></Card>}
      </DataState>}
    <Dialog open={testOpen} onOpenChange={(open) => { if (!testSaving) setTestOpen(open) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send test notification</DialogTitle><DialogDescription>Sends a test message to your own account so you can verify provider delivery.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><label htmlFor="test-channel" className="text-sm font-medium">Channel</label><select id="test-channel" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={testChannel} onChange={(event) => setTestChannel(event.target.value as "EMAIL" | "SMS" | "WHATSAPP")} disabled={testSaving}><option value="EMAIL">Email</option><option value="SMS">SMS</option><option value="WHATSAPP">WhatsApp</option></select></div>
          {testResult && <p role="status" className={testResult.status === "SENT" ? "text-sm text-green-700" : "text-sm text-destructive"}>Status: {testResult.status}{testResult.errorMessage ? ` — ${testResult.errorMessage}` : ""}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setTestOpen(false)} disabled={testSaving}>Close</Button><Button onClick={sendTest} disabled={testSaving}>{testSaving ? "Sending…" : "Send test"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div></MainLayout>
}
