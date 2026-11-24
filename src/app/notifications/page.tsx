"use client"

import * as React from "react"
import { Bell, Mail, MessageSquare, Smartphone } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/operations/page-header"
import { DataState, EmptyState, TableSkeleton } from "@/components/operations/data-state"
import { FilterSelect } from "@/components/operations/list-controls"
import { formatDateTime, formatStatus } from "@/lib/utils"

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
  const canRead = Boolean(user?.permissions.includes("notifications:read"))

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

  return <MainLayout><div className="space-y-5">
    <PageHeader
      title="Notifications"
      description="Delivery log for email, SMS and WhatsApp. Channels activate once SMTP or Twilio is configured."
      onRefresh={() => setAttempt((value) => value + 1)}
      refreshing={loading}
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
  </div></MainLayout>
}
