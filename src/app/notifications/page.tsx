"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Bell,
  Search,
  Filter,
  Eye,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Mail,
  Smartphone,
  MessageSquare,
} from "lucide-react"
import { formatDateTime } from "@/lib/utils"
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

const notifications = [
  {
    id: "NOT-2026-0001",
    template: "request_submitted",
    channel: "IN_APP",
    recipient: "admin@aca.gov.in",
    subject: "New Ticket Request Submitted",
    body: "A new ticket request REQ-2026-0042 has been submitted by Dr. S. Ramesh for India vs Australia - 2nd ODI. Requested: 30 tickets.",
    status: "DELIVERED",
    provider: "internal",
    sentAt: "2026-11-20T09:15:00",
    deliveredAt: "2026-11-20T09:15:00",
  },
  {
    id: "NOT-2026-0002",
    template: "approval_pending",
    channel: "EMAIL",
    recipient: "sarah.johnson@aca.gov.in",
    subject: "Approval Required - REQ-2026-0038",
    body: "Request REQ-2026-0038 requires your approval. Requested: 25 VIP tickets for India vs Australia - 2nd ODI.",
    status: "SENT",
    provider: "SMTP",
    providerId: "smtp-001",
    sentAt: "2026-11-19T14:30:00",
  },
  {
    id: "NOT-2026-0003",
    template: "approval_pending",
    channel: "SMS",
    recipient: "+919876543214",
    subject: "",
    body: "ACA TicketOps: You have a pending approval for REQ-2026-0038 (25 VIP tickets). Please review.",
    status: "DELIVERED",
    provider: "Twilio",
    providerId: "twilio-001",
    sentAt: "2026-11-19T14:30:05",
    deliveredAt: "2026-11-19T14:30:07",
  },
  {
    id: "NOT-2026-0004",
    template: "request_approved",
    channel: "IN_APP",
    recipient: "rajesh@ril.com",
    subject: "Request Approved - REQ-2026-0038",
    body: "Your request REQ-2026-0038 has been approved. Approved quantity: 25 out of 25.",
    status: "DELIVERED",
    provider: "internal",
    sentAt: "2026-11-20T10:35:00",
    deliveredAt: "2026-11-20T10:35:00",
  },
  {
    id: "NOT-2026-0005",
    template: "request_approved",
    channel: "EMAIL",
    recipient: "rajesh@ril.com",
    subject: "Request Approved - REQ-2026-0038",
    body: "Your request REQ-2026-0038 has been approved. Approved quantity: 25 out of 25.",
    status: "SENT",
    provider: "SMTP",
    providerId: "smtp-002",
    sentAt: "2026-11-20T10:35:00",
  },
  {
    id: "NOT-2026-0006",
    template: "tickets_issued",
    channel: "SMS",
    recipient: "+919876500001",
    subject: "",
    body: "ACA TicketOps: Your 15 VIP tickets for India vs Australia are ready for collection at Gate 1. Reference: ISS-2026-00042",
    status: "DELIVERED",
    provider: "Twilio",
    providerId: "twilio-002",
    sentAt: "2026-11-20T10:40:00",
    deliveredAt: "2026-11-20T10:40:02",
  },
  {
    id: "NOT-2026-0007",
    template: "distribution_deadline",
    channel: "IN_APP",
    recipient: "distribution1@aca.gov.in",
    subject: "Distribution Deadline Approaching",
    body: "Distribution deadline for match India vs Australia - 2nd ODI is in 2 days. 1,840 tickets still pending distribution.",
    status: "DELIVERED",
    provider: "internal",
    sentAt: "2026-11-20T08:00:00",
    deliveredAt: "2026-11-20T08:00:00",
  },
  {
    id: "NOT-2026-0008",
    template: "quota_exceeded",
    channel: "EMAIL",
    recipient: "michael.brown@aca.gov.in",
    subject: "Quota Limit Exceeded - SPONSORS",
    body: "Request REQ-2026-0038 exceeds the quota limit for SPONSORS. Available: 450, Requested: 500.",
    status: "FAILED",
    provider: "SMTP",
    errorMessage: "Connection timeout",
    sentAt: "2026-11-18T15:00:00",
  },
  {
    id: "NOT-2026-0009",
    template: "inventory_low",
    channel: "IN_APP",
    recipient: "emily.davis@aca.gov.in",
    subject: "Low Inventory Alert - VIP",
    body: "Inventory for VIP - VIP Pavilion A is running low. Only 45 tickets remaining.",
    status: "DELIVERED",
    provider: "internal",
    sentAt: "2026-11-19T16:00:00",
    deliveredAt: "2026-11-19T16:00:00",
  },
  {
    id: "NOT-2026-0010",
    template: "allocation_completed",
    channel: "IN_APP",
    recipient: "david.miller@aca.gov.in",
    subject: "Allocation Completed - ALC-2026-0012",
    body: "Allocation ALC-2026-0012 for request REQ-2026-0042 has been completed. 20 tickets allocated.",
    status: "DELIVERED",
    provider: "internal",
    sentAt: "2026-11-20T11:00:00",
    deliveredAt: "2026-11-20T11:00:00",
  },
  {
    id: "NOT-2026-0011",
    template: "request_rejected",
    channel: "EMAIL",
    recipient: "test@example.com",
    subject: "Request Rejected - REQ-2026-0030",
    body: "Your request REQ-2026-0030 has been rejected. Reason: Duplicate request detected.",
    status: "BOUNCED",
    provider: "SMTP",
    errorMessage: "Email address not found",
    sentAt: "2026-11-18T12:00:00",
  },
]

const templates = [
  { key: "request_submitted", name: "Request Submitted", channel: "IN_APP", subject: "New Ticket Request Submitted", active: true },
  { key: "request_assigned", name: "Request Assigned", channel: "IN_APP", subject: "Request Assigned to You", active: true },
  { key: "approval_pending", name: "Approval Pending", channel: "IN_APP", subject: "Approval Required", active: true },
  { key: "approval_pending", name: "Approval Pending (Email)", channel: "EMAIL", subject: "Approval Required", active: true },
  { key: "approval_pending", name: "Approval Pending (SMS)", channel: "SMS", subject: "", active: true },
  { key: "request_approved", name: "Request Approved", channel: "IN_APP", subject: "Request Approved", active: true },
  { key: "request_approved", name: "Request Approved (Email)", channel: "EMAIL", subject: "Request Approved", active: true },
  { key: "request_rejected", name: "Request Rejected", channel: "EMAIL", subject: "Request Rejected", active: true },
  { key: "allocation_completed", name: "Allocation Completed", channel: "IN_APP", subject: "Ticket Allocation Completed", active: true },
  { key: "tickets_issued", name: "Tickets Issued", channel: "IN_APP", subject: "Tickets Issued for Collection", active: true },
  { key: "tickets_issued", name: "Tickets Issued (SMS)", channel: "SMS", subject: "", active: true },
  { key: "distribution_deadline", name: "Distribution Deadline", channel: "IN_APP", subject: "Distribution Deadline Approaching", active: true },
  { key: "quota_exceeded", name: "Quota Exceeded", channel: "IN_APP", subject: "Quota Limit Exceeded", active: true },
  { key: "quota_exceeded", name: "Quota Exceeded (Email)", channel: "EMAIL", subject: "Quota Limit Exceeded", active: true },
  { key: "inventory_low", name: "Inventory Running Low", channel: "IN_APP", subject: "Low Inventory Alert", active: true },
]

export default function NotificationsPage() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = React.useState("logs")
  const [search, setSearch] = React.useState("")
  const [channelFilter, setChannelFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const filteredNotifications = notifications.filter((n) => {
    const matchesSearch = n.id.toLowerCase().includes(search.toLowerCase()) ||
      n.recipient.toLowerCase().includes(search.toLowerCase()) ||
      n.subject.toLowerCase().includes(search.toLowerCase()) ||
      n.body.toLowerCase().includes(search.toLowerCase())
    const matchesChannel = channelFilter === "all" || n.channel === channelFilter
    const matchesStatus = statusFilter === "all" || n.status === statusFilter
    return matchesSearch && matchesChannel && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "destructive" | "warning" | "success" | "info"> = {
      DELIVERED: "success",
      SENT: "default",
      PENDING: "warning",
      FAILED: "destructive",
      BOUNCED: "destructive",
    }
    return <Badge variant={variants[status] || "default"}>{status}</Badge>
  }

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "EMAIL": return <Mail className="h-3.5 w-3.5" />
      case "SMS": return <Smartphone className="h-3.5 w-3.5" />
      case "WHATSAPP": return <MessageSquare className="h-3.5 w-3.5" />
      default: return <Bell className="h-3.5 w-3.5" />
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">Manage notification templates and delivery logs</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="logs">
              <Bell className="h-4 w-4 mr-2" />
              Delivery Logs ({notifications.length})
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="h-4 w-4 mr-2" />
              Templates ({templates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by ID, recipient, subject..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="flex h-10 w-[160px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Channels</option>
                    <option value="IN_APP">In-App</option>
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                    <option value="WHATSAPP">WhatsApp</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="flex h-10 w-[160px] items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="SENT">Sent</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                    <option value="BOUNCED">Bounced</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Notifications Table */}
            <Card>
              <CardHeader>
                <CardTitle>Notification Delivery Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Sent At</TableHead>
                        <TableHead>Delivered At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNotifications.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell className="font-mono text-sm">{n.id}</TableCell>
                          <TableCell><Badge variant="secondary">{n.template}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getChannelIcon(n.channel)}
                              <Badge variant="outline">{n.channel}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{n.recipient}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{n.subject || "-"}</TableCell>
                          <TableCell>{getStatusBadge(n.status)}</TableCell>
                          <TableCell className="text-sm">{n.provider}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{n.sentAt ? formatDateTime(n.sentAt) : "-"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{n.deliveredAt ? formatDateTime(n.deliveredAt) : "-"}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => {}}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                {n.status === "FAILED" && (
                                  <DropdownMenuItem onClick={() => {}}>
                                    <Send className="h-4 w-4 mr-2" />
                                    Retry
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem>View Template</DropdownMenuItem>
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

          <TabsContent value="templates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Notification Templates
                  <Button size="sm" asChild>
                    <Link href="/admin/notifications/new">
                      <Plus className="h-4 w-4 mr-2" />
                      New Template
                    </Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((t) => (
                        <TableRow key={`${t.key}-${t.channel}`}>
                          <TableCell className="font-mono text-sm">{t.key}</TableCell>
                          <TableCell>{t.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getChannelIcon(t.channel)}
                              <Badge variant="outline">{t.channel}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{t.subject || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={t.active ? "success" : "secondary"}>
                              {t.active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{t.name}</DropdownMenuLabel>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/notifications/${t.key}/${t.channel}/edit`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Template
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem>Preview</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className={t.active ? "text-destructive" : ""}>
                                  {t.active ? "Deactivate" : "Activate"}
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
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}

import { MoreHorizontal, Plus, Edit, FileText } from "lucide-react"