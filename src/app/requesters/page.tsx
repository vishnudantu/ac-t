"use client"

import * as React from "react"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import { AlertCircle, Building, Download, Mail, Phone, Plus, Search, Upload, Users } from "lucide-react"
import { z } from "zod"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, formatPhone, formatStatus } from "@/lib/utils"

type RequesterRecord = Prisma.RequesterGetPayload<{
  include: {
    organisation: { select: { id: true; name: true; category: true } }
    _count: { select: { requests: true } }
    requests: { select: { createdAt: true } }
  }
}>
interface OrganisationOption { id: string; name: string; category: string }
type RequesterListItem = Omit<RequesterRecord, "requests"> & { latestRequest: { createdAt: Date } | null; totalTickets: number }
interface RequestersResponse { requesters: RequesterListItem[]; total: number; organisations: OrganisationOption[] }

const formSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  mobileNumber: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,17}$/, "Enter a valid mobile number"),
  email: z.string().trim().email("Enter a valid email address").or(z.literal("")),
  designation: z.string().trim(),
  organisationId: z.string(),
  organisationName: z.string().trim(),
  requesterCategory: z.string().min(1, "Select a category"),
  protocolLevel: z.string().regex(/^\d+$/, "Enter a protocol level"),
  contactPreference: z.enum(["PHONE", "EMAIL", "WHATSAPP"]),
  specialInstructions: z.string().trim().max(2000),
}).superRefine((data, context) => {
  if (!data.organisationId && data.organisationName.trim().length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["organisationName"], message: "Select an organisation or enter a new one" })
  }
})
type RequesterForm = z.infer<typeof formSchema>
const initialForm: RequesterForm = { fullName: "", mobileNumber: "", email: "", designation: "", organisationId: "", organisationName: "", requesterCategory: "", protocolLevel: "0", contactPreference: "PHONE", specialInstructions: "" }
const categories = ["VIP", "OFFICIAL", "BCCI", "GOVERNMENT", "SPONSOR", "MEDIA", "MEMBER", "STAFF", "GENERAL"]
const selectClassName = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const PAGE_SIZE = 25

export default function RequestersPage() {
  const { user, loading: sessionLoading } = useSession()
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [category, setCategory] = React.useState("all")
  const [offset, setOffset] = React.useState(0)
  const [data, setData] = React.useState<RequestersResponse>({ requesters: [], total: 0, organisations: [] })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [reloadKey, setReloadKey] = React.useState(0)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<RequesterForm>(initialForm)
  const [formError, setFormError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const canRead = Boolean(user?.permissions.includes("requests:read"))
  const canWrite = Boolean(user?.permissions.includes("requests:write"))

  React.useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim()); setOffset(0) }, 350)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  React.useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    const loadRequesters = async () => {
      setLoading(true)
      setError("")
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), active: "all", category })
      if (search) params.set("search", search)
      try {
        const result = await fetch(`/api/requesters?${params.toString()}`, { signal: controller.signal })
        const body: unknown = await result.json()
        if (!result.ok) throw new Error(apiError(body, "Unable to load requesters"))
        const response = body as RequestersResponse
        setData({ requesters: response.requesters || [], total: response.total || 0, organisations: response.organisations || [] })
      } catch (loadError: unknown) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return
        setError(errorMessage(loadError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadRequesters()
    return () => controller.abort()
  }, [canRead, category, offset, reloadKey, search, sessionLoading])

  const updateForm = <K extends keyof RequesterForm>(key: K, value: RequesterForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const createRequester = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError("")
    const parsed = formSchema.safeParse(form)
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message || "Check the requester details"); return }
    if (parsed.data.contactPreference === "EMAIL" && !parsed.data.email) { setFormError("Email is required when email is the preferred contact method"); return }
    setSaving(true)
    try {
      const result = await fetch("/api/requesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, protocolLevel: Number(parsed.data.protocolLevel), organisationId: parsed.data.organisationId || undefined, organisationName: parsed.data.organisationId ? undefined : parsed.data.organisationName, email: parsed.data.email || undefined }),
      })
      const body: unknown = await result.json()
      if (!result.ok) throw new Error(apiError(body, "Unable to create requester"))
      setDialogOpen(false)
      setForm(initialForm)
      setNotice(`${parsed.data.fullName} was added to the requester directory.`)
      setReloadKey((key) => key + 1)
    } catch (saveError: unknown) {
      setFormError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">Requesters</h1><p className="text-muted-foreground">Manage contacts and their ticket request history</p></div>
          <div className="flex flex-wrap gap-2">
            {user?.permissions.includes("requests:bulk_import") && <Button variant="outline" asChild><Link href="/admin/import-export"><Upload className="mr-2 h-4 w-4" />Import</Link></Button>}
            {user?.permissions.includes("requests:export") && <Button variant="outline" asChild><Link href="/admin/import-export"><Download className="mr-2 h-4 w-4" />Export</Link></Button>}
            {canWrite && <Button onClick={() => { setFormError(""); setDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />New requester</Button>}
          </div>
        </div>

        {!sessionLoading && !canRead ? <PermissionAlert /> : <>
          {notice && <Alert><AlertTitle>Requester created</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
          <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-[minmax(240px,1fr)_200px]">
            <div className="space-y-2"><Label htmlFor="requester-search">Search requesters</Label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="requester-search" className="pl-10" placeholder="Name, phone, email or organisation" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div></div>
            <div className="space-y-2"><Label htmlFor="requester-category">Category</Label><select id="requester-category" className={selectClassName} value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0) }}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{formatStatus(item)}</option>)}</select></div>
          </CardContent></Card>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Could not load requesters</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Try again</Button></AlertDescription></Alert>}
          <Card><CardHeader><CardTitle>Requester directory ({data.total})</CardTitle></CardHeader><CardContent>
            {loading ? <Loading /> : !error && data.requesters.length === 0 ? <div className="py-12 text-center"><Users className="mx-auto h-12 w-12 text-muted-foreground/50" /><h2 className="mt-4 text-lg font-medium">No requesters found</h2><p className="mt-2 text-muted-foreground">Try another search or category, or add a new requester.</p></div> : !error ? <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Organisation</TableHead><TableHead>Category / protocol</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Tickets requested</TableHead><TableHead>Last request</TableHead><TableHead>Status</TableHead>{canWrite && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
              <TableBody>{data.requesters.map((requester) => {
                return <TableRow key={requester.id}>
                  <TableCell><p className="font-medium">{requester.fullName}</p><p className="text-sm text-muted-foreground">{requester.designation || "No designation"}</p></TableCell>
                  <TableCell><div className="space-y-1 text-sm"><a className="flex items-center gap-1 hover:underline" href={`tel:${requester.mobileNumber}`}><Phone className="h-3.5 w-3.5" />{formatPhone(requester.mobileNumber)}</a>{requester.email && <a className="flex items-center gap-1 text-muted-foreground hover:underline" href={`mailto:${requester.email}`}><Mail className="h-3.5 w-3.5" /><span className="max-w-[190px] truncate">{requester.email}</span></a>}</div></TableCell>
                  <TableCell><div className="flex max-w-[200px] items-center gap-1"><Building className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{requester.organisation?.name || "No organisation"}</span></div></TableCell>
                  <TableCell><Badge variant="secondary">{formatStatus(requester.requesterCategory)}</Badge><p className="mt-1 text-xs text-muted-foreground">Protocol level {requester.protocolLevel}</p></TableCell>
                  <TableCell className="text-right font-medium">{requester._count.requests}</TableCell><TableCell className="text-right font-medium">{requester.totalTickets}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{requester.latestRequest ? formatDate(requester.latestRequest.createdAt) : "Never"}</TableCell>
                  <TableCell><Badge variant={requester.isActive ? "success" : "secondary"}>{requester.isActive ? "Active" : "Inactive"}</Badge>{requester.isVerified && <span className="ml-1 text-xs text-muted-foreground">Verified</span>}</TableCell>
                  {canWrite && <TableCell><Button variant="ghost" size="sm" asChild><Link href={`/requests/new?requester=${requester.id}`}><Plus className="mr-2 h-4 w-4" />New request</Link></Button></TableCell>}
                </TableRow>
              })}</TableBody>
            </Table></div> : null}
          </CardContent></Card>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><p>{data.total === 0 ? "0 requesters" : `Showing ${offset + 1}–${Math.min(offset + data.requesters.length, data.total)} of ${data.total}`}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>Previous</Button><Button variant="outline" size="sm" disabled={offset + data.requesters.length >= data.total || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}>Next</Button></div></div>
        </>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Add a requester</DialogTitle><DialogDescription>Create a contact that can be selected on new ticket requests.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={createRequester}>
            {formError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{formError}</AlertDescription></Alert>}
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" id="requester-full-name" required><Input id="requester-full-name" autoComplete="name" value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} required maxLength={150} /></Field><Field label="Mobile number" id="requester-mobile" required><Input id="requester-mobile" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={form.mobileNumber} onChange={(event) => updateForm("mobileNumber", event.target.value)} required /></Field><Field label="Email" id="requester-email"><Input id="requester-email" type="email" autoComplete="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} /></Field><Field label="Designation" id="requester-designation"><Input id="requester-designation" value={form.designation} onChange={(event) => updateForm("designation", event.target.value)} maxLength={150} /></Field></div>
            <div className="space-y-2"><Label htmlFor="requester-organisation">Existing organisation</Label><select id="requester-organisation" className={selectClassName} value={form.organisationId} onChange={(event) => updateForm("organisationId", event.target.value)}><option value="">Create or enter an organisation below</option>{data.organisations.map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.name}</option>)}</select></div>
            {!form.organisationId && <Field label="New organisation name" id="requester-organisation-name" required><Input id="requester-organisation-name" value={form.organisationName} onChange={(event) => updateForm("organisationName", event.target.value)} maxLength={200} required /></Field>}
            <div className="grid gap-4 sm:grid-cols-3"><Field label="Category" id="requester-new-category" required><select id="requester-new-category" className={selectClassName} value={form.requesterCategory} onChange={(event) => updateForm("requesterCategory", event.target.value)} required><option value="">Select</option>{categories.map((item) => <option key={item} value={item}>{formatStatus(item)}</option>)}</select></Field><Field label="Protocol level" id="requester-protocol"><Input id="requester-protocol" type="number" min={0} max={10} value={form.protocolLevel} onChange={(event) => updateForm("protocolLevel", event.target.value)} /></Field><Field label="Preferred contact" id="requester-contact"><select id="requester-contact" className={selectClassName} value={form.contactPreference} onChange={(event) => updateForm("contactPreference", event.target.value as RequesterForm["contactPreference"])}><option value="PHONE">Phone</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select></Field></div>
            <div className="space-y-2"><Label htmlFor="requester-instructions">Special instructions</Label><Textarea id="requester-instructions" value={form.specialInstructions} onChange={(event) => updateForm("specialInstructions", event.target.value)} maxLength={2000} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create requester"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}

interface FieldProps { label: string; id: string; required?: boolean; children: React.ReactNode }
function Field({ label, id, required, children }: FieldProps) { return <div className="space-y-2"><Label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</Label>{children}</div> }
function Loading() { return <div className="flex h-48 items-center justify-center" role="status"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /><span className="sr-only">Loading requesters</span></div> }
function PermissionAlert() { return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Access unavailable</AlertTitle><AlertDescription>Your account does not have permission to view requesters.</AlertDescription></Alert> }
function apiError(body: unknown, fallback: string): string { return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : fallback }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unexpected error" }
