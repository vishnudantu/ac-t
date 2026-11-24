"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { AlertCircle, ArrowLeft, Building, Calendar, FileText, Mail, MapPin, Phone } from "lucide-react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatDateTime, formatPhone, formatStatus, getPriorityColor, getStatusColor } from "@/lib/utils"

type RequestDetail = Prisma.RequestGetPayload<{
  include: {
    match: { include: { venue: { select: { id: true; name: true; city: true; state: true } } } }
    requester: { include: { organisation: { select: { id: true; name: true; category: true } } } }
    createdBy: { select: { id: true; fullName: true; email: true } }
    assignedTo: { select: { id: true; fullName: true; email: true } }
    items: { include: { ticketCategory: { select: { id: true; name: true; displayName: true } } } }
    _count: { select: { attachments: true; comments: true; approvalSteps: true } }
  }
}>

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>()
  const requestId = Array.isArray(params.id) ? params.id[0] : params.id
  const { user, loading: sessionLoading } = useSession()
  const [request, setRequest] = React.useState<RequestDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const canRead = Boolean(user?.permissions.includes("requests:read"))
  const canWrite = Boolean(user?.permissions.includes("requests:write"))

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    const loadRequest = async () => {
      setLoading(true)
      setError("")
      try {
        const result = await fetch(`/api/requests/${encodeURIComponent(requestId)}`, { signal: controller.signal })
        const body: unknown = await result.json()
        if (!result.ok) throw new Error(apiError(body, result.status === 404 ? "Request not found" : "Unable to load request"))
        setRequest((body as { request: RequestDetail }).request)
      } catch (loadError: unknown) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return
        setError(errorMessage(loadError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadRequest()
    return () => controller.abort()
  }, [canRead, requestId, sessionLoading])

  return (
    <MainLayout><div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><Button variant="ghost" size="sm" asChild><Link href="/requests"><ArrowLeft className="mr-2 h-4 w-4" />Back to requests</Link></Button><h1 className="mt-2 text-3xl font-bold tracking-tight">{request ? request.requestNumber : "Request details"}</h1>{request && <p className="text-muted-foreground">Created {formatDateTime(request.createdAt)} by {request.createdBy.fullName}</p>}</div>{request && <div className="flex flex-wrap gap-2"><Badge className={getStatusColor(request.status)}>{formatStatus(request.status)}</Badge><Badge className={getPriorityColor(request.priority)}>{formatStatus(request.priority)}</Badge></div>}</div>
      {!sessionLoading && !canRead ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Access unavailable</AlertTitle><AlertDescription>Your account does not have permission to view requests.</AlertDescription></Alert> : loading ? <div className="flex h-64 items-center justify-center" role="status"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /><span className="sr-only">Loading request details</span></div> : error || !request ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Could not display request</AlertTitle><AlertDescription>{error || "Request not found"}</AlertDescription></Alert> : <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Requested" value={request.totalRequested} /><Metric label="Approved" value={request.totalApproved} /><Metric label="Allocated" value={request.totalAllocated} /><Metric label="Issued" value={request.totalIssued} /></div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Requester</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="text-lg font-medium">{request.requester.fullName}</p>{request.requester.designation && <p className="text-muted-foreground">{request.requester.designation}</p>}<p className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" />{request.requester.organisation?.name || "No organisation"}</p><a className="flex items-center gap-2 hover:underline" href={`tel:${request.requester.mobileNumber}`}><Phone className="h-4 w-4 text-muted-foreground" />{formatPhone(request.requester.mobileNumber)}</a>{request.requester.email && <a className="flex items-center gap-2 hover:underline" href={`mailto:${request.requester.email}`}><Mail className="h-4 w-4 text-muted-foreground" />{request.requester.email}</a>}<div className="flex flex-wrap gap-2 pt-2"><Badge variant="secondary">{formatStatus(request.requester.requesterCategory)}</Badge>{request.requester.isVerified && <Badge variant="success">Verified</Badge>}</div>{canWrite && <Button className="mt-2" variant="outline" size="sm" asChild><Link href={`/requests/new?requester=${request.requester.id}`}>New request for this requester</Link></Button>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Match</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="text-lg font-medium">{request.match.title}</p>{request.match.tournament && <p className="text-muted-foreground">{request.match.tournament}</p>}<p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />{formatDate(request.match.matchDate)} at {request.match.startTime}</p><p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{request.match.venue.name}, {request.match.venue.city}, {request.match.venue.state}</span></p><p className="text-muted-foreground">Assigned to {request.assignedTo?.fullName || "no one"}</p></CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle>Requested ticket categories</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Requested</TableHead><TableHead className="text-right">Approved</TableHead><TableHead className="text-right">Allocated</TableHead><TableHead className="text-right">Issued</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>{request.items.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.ticketCategory.displayName}<p className="text-xs text-muted-foreground">{item.ticketCategory.name}</p></TableCell><TableCell className="text-right">{item.requestedQuantity}</TableCell><TableCell className="text-right">{item.approvedQuantity}</TableCell><TableCell className="text-right">{item.allocatedQuantity}</TableCell><TableCell className="text-right">{item.issuedQuantity}</TableCell><TableCell className="max-w-[240px] text-sm text-muted-foreground">{item.notes || "—"}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
        <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Request information</CardTitle></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2"><Description label="Source" value={formatStatus(request.source)} /><Description label="Source reference" value={request.sourceReference || "—"} /><Description label="Delivery method" value={request.requiredDeliveryMethod ? formatStatus(request.requiredDeliveryMethod) : "No preference"} /><Description label="Fulfilment" value={formatStatus(request.fulfilmentStatus)} /><Description label="Created by" value={request.createdBy.fullName} /><Description label="Last updated" value={formatDateTime(request.updatedAt)} /></dl></CardContent></Card><Card><CardHeader><CardTitle>Purpose and instructions</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div><h3 className="font-medium">Purpose</h3><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{request.purpose || "No purpose recorded."}</p></div><div><h3 className="font-medium">Special instructions</h3><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{request.specialInstructions || "No special instructions recorded."}</p></div>{request.requester.specialInstructions && <div><h3 className="font-medium">Requester instructions</h3><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{request.requester.specialInstructions}</p></div>}</CardContent></Card></div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4" />{request._count.attachments} attachments · {request._count.comments} comments · {request._count.approvalSteps} approval steps</p>
      </>}
    </div></MainLayout>
  )
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></CardContent></Card> }
function Description({ label, value }: { label: string; value: string }) { return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div> }
function apiError(body: unknown, fallback: string): string { return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : fallback }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unable to load request" }
