"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { AlertCircle, ArrowLeft, Plus, Trash2 } from "lucide-react"
import { z } from "zod"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, formatStatus } from "@/lib/utils"

type MatchOption = Prisma.MatchGetPayload<{ include: { venue: true } }>
type RequesterOption = Prisma.RequesterGetPayload<{ include: { organisation: { select: { id: true; name: true; category: true } } } }>
interface OrganisationOption { id: string; name: string; category: string }
interface CategoryOption { id: string; matchId: string; name: string; displayName: string; description: string | null; sortOrder: number }
interface RequestLine { key: string; ticketCategoryId: string; requestedQuantity: string; notes: string }
interface CreatedRequest { id: string; requestNumber: string }

const sources = ["IN_PERSON", "EMAIL", "WHATSAPP", "LETTER", "PHONE", "ONLINE_FORM", "INTERNAL"] as const
const priorities = ["LOW", "NORMAL", "HIGH", "PROTOCOL"] as const
const requesterCategories = ["VIP", "OFFICIAL", "BCCI", "GOVERNMENT", "SPONSOR", "MEDIA", "MEMBER", "STAFF", "GENERAL"]
const selectClassName = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const requestSchema = z.object({ matchId: z.string().min(1, "Select a match"), source: z.enum(sources), priority: z.enum(priorities), sourceReference: z.string().trim().max(500), purpose: z.string().trim().max(2000), requiredDeliveryMethod: z.enum(["", "PHYSICAL", "DIGITAL", "BOTH"]), specialInstructions: z.string().trim().max(2000), ticketType: z.enum(["COMPLIMENTARY", "PURCHASE"]) })
type TicketPurpose = "PURCHASE" | "COMPLIMENTARY"
type CategoryAvailability = { id: string; capacity: number; allocated: number; remaining: number; inventoryPurpose: TicketPurpose | null }
type RequestForm = Omit<z.infer<typeof requestSchema>, "ticketType"> & { ticketType: TicketPurpose | "" }
const requesterSchema = z.object({ fullName: z.string().trim().min(2, "Enter the requester’s full name"), mobileNumber: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,17}$/, "Enter a valid mobile number"), email: z.string().trim().email("Enter a valid email address").or(z.literal("")), designation: z.string().trim().max(150), organisationId: z.string(), organisationName: z.string().trim(), requesterCategory: z.string().min(1, "Select a requester category"), protocolLevel: z.string().regex(/^([0-9]|10)$/, "Protocol level must be between 0 and 10"), contactPreference: z.enum(["PHONE", "WHATSAPP", "EMAIL"]), specialInstructions: z.string().trim().max(2000) }).superRefine((data, context) => { if (!data.organisationId && data.organisationName.length < 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ["organisationName"], message: "Select an organisation or enter a new organisation name" }) })
type RequesterForm = z.infer<typeof requesterSchema>
const initialRequest: RequestForm = { matchId: "", source: "IN_PERSON", priority: "NORMAL", sourceReference: "", purpose: "", requiredDeliveryMethod: "", specialInstructions: "", ticketType: "" }
const initialRequester: RequesterForm = { fullName: "", mobileNumber: "", email: "", designation: "", organisationId: "", organisationName: "", requesterCategory: "", protocolLevel: "0", contactPreference: "PHONE", specialInstructions: "" }

export default function NewRequestPage() {
  return <React.Suspense fallback={<MainLayout><Loading label="Loading request form" /></MainLayout>}><NewRequestForm /></React.Suspense>
}

function NewRequestForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: sessionLoading } = useSession()
  const [requestForm, setRequestForm] = React.useState<RequestForm>(initialRequest)
  const [requesterMode, setRequesterMode] = React.useState<"existing" | "new">("existing")
  const [requesterId, setRequesterId] = React.useState(searchParams.get("requester") || "")
  const [requesterForm, setRequesterForm] = React.useState<RequesterForm>(initialRequester)
  const [matches, setMatches] = React.useState<MatchOption[]>([])
  const [requesters, setRequesters] = React.useState<RequesterOption[]>([])
  const [organisations, setOrganisations] = React.useState<OrganisationOption[]>([])
  const [categories, setCategories] = React.useState<CategoryOption[]>([])
  const [availability, setAvailability] = React.useState<Record<string, CategoryAvailability>>({})
  const [lines, setLines] = React.useState<RequestLine[]>([{ key: "line-1", ticketCategoryId: "", requestedQuantity: "1", notes: "" }])
  const nextLine = React.useRef(2)
  const [loading, setLoading] = React.useState(true)
  const [categoriesLoading, setCategoriesLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState("")
  const [categoryError, setCategoryError] = React.useState("")
  const [formError, setFormError] = React.useState("")
  const [reloadKey, setReloadKey] = React.useState(0)
  const [savingStatus, setSavingStatus] = React.useState<"DRAFT" | "SUBMITTED" | "">("")
  const canWrite = Boolean(user?.permissions.includes("requests:write"))

  React.useEffect(() => {
    if (sessionLoading || !canWrite) { if (!sessionLoading) setLoading(false); return }
    const controller = new AbortController()
    const loadOptions = async () => {
      setLoading(true)
      setLoadError("")
      try {
        const [matchResult, requesterResult] = await Promise.all([
          fetch("/api/matches?limit=100", { signal: controller.signal }),
          fetch("/api/requesters?limit=100&active=true", { signal: controller.signal }),
        ])
        const matchBody: unknown = await matchResult.json()
        const requesterBody: unknown = await requesterResult.json()
        if (!matchResult.ok) throw new Error(`${apiError(matchBody, "Unable to load matches")}. Match read access is required to create a request.`)
        if (!requesterResult.ok) throw new Error(apiError(requesterBody, "Unable to load requesters"))
        const matchData = matchBody as { matches: MatchOption[] }
        const requesterData = requesterBody as { requesters: RequesterOption[]; organisations: OrganisationOption[] }
        setMatches(matchData.matches || [])
        setRequesters(requesterData.requesters || [])
        setOrganisations(requesterData.organisations || [])
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setLoadError(errorMessage(error))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadOptions()
    return () => controller.abort()
  }, [canWrite, reloadKey, sessionLoading])

  React.useEffect(() => {
    if (!requestForm.matchId) { setCategories([]); setAvailability({}); return }
    const controller = new AbortController()
    setAvailability({})
    fetch(`/api/availability?matchId=${encodeURIComponent(requestForm.matchId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((body: { categories?: CategoryAvailability[] }) => {
        const map: Record<string, CategoryAvailability> = {}
        for (const row of body.categories || []) map[row.id] = row
        if (!controller.signal.aborted) setAvailability(map)
      })
      .catch(() => { if (!controller.signal.aborted) setAvailability({}) })
    const loadCategories = async () => {
      setCategoriesLoading(true)
      setCategoryError("")
      setCategories([])
      setLines([{ key: "line-1", ticketCategoryId: "", requestedQuantity: "1", notes: "" }])
      try {
        const result = await fetch(`/api/matches/${encodeURIComponent(requestForm.matchId)}/categories`, { signal: controller.signal })
        const body: unknown = await result.json()
        if (!result.ok) throw new Error(apiError(body, "Unable to load ticket categories"))
        setCategories((body as { categories: CategoryOption[] }).categories || [])
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setCategoryError(errorMessage(error))
      } finally {
        if (!controller.signal.aborted) setCategoriesLoading(false)
      }
    }
    void loadCategories()
    return () => controller.abort()
  }, [requestForm.matchId])

  const updateRequest = <K extends keyof RequestForm>(key: K, value: RequestForm[K]) => setRequestForm((current) => ({ ...current, [key]: value }))
  const updateRequester = <K extends keyof RequesterForm>(key: K, value: RequesterForm[K]) => setRequesterForm((current) => ({ ...current, [key]: value }))
  const updateLine = (key: string, changes: Partial<Omit<RequestLine, "key">>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line))
  const addLine = () => { const key = `line-${nextLine.current}`; nextLine.current += 1; setLines((current) => [...current, { key, ticketCategoryId: "", requestedQuantity: "1", notes: "" }]) }

  const purposes = lines.map(line => availability[line.ticketCategoryId]?.inventoryPurpose)
  const inventoryPurpose = purposes.every(purpose => purpose === purposes[0]) ? purposes[0] : null
  const ticketType = requestForm.ticketType || inventoryPurpose || ""

  const saveRequest = async (status: "DRAFT" | "SUBMITTED") => {
    setFormError("")
    if (!ticketType) { setFormError("Select the ticket categories and choose a ticket type if inventory has no single classification."); return }
    const parsedRequest = requestSchema.safeParse({ ...requestForm, ticketType })
    if (!parsedRequest.success) { setFormError(parsedRequest.error.issues[0]?.message || "Check the request details"); return }
    if (requesterMode === "existing" && !requesterId) { setFormError("Select a requester or create a new requester"); return }
    const parsedRequester = requesterMode === "new" ? requesterSchema.safeParse(requesterForm) : null
    if (parsedRequester && !parsedRequester.success) { setFormError(parsedRequester.error.issues[0]?.message || "Check the new requester details"); return }
    if (parsedRequester?.success && parsedRequester.data.contactPreference === "EMAIL" && !parsedRequester.data.email) { setFormError("Email is required when it is the preferred contact method"); return }
    if (lines.length === 0) { setFormError("Add at least one ticket category"); return }
    if (lines.some((line) => !line.ticketCategoryId || !/^[1-9]\d*$/.test(line.requestedQuantity))) { setFormError("Select a category and enter a positive whole-number quantity for every line"); return }
    const categoryIds = lines.map((line) => line.ticketCategoryId)
    if (new Set(categoryIds).size !== categoryIds.length) { setFormError("Each ticket category can appear only once; update its quantity instead"); return }

    setSavingStatus(status)
    try {
      let selectedRequesterId = requesterId
      let createdRequester = false
      if (parsedRequester?.success) {
        const result = await fetch("/api/requesters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...parsedRequester.data, protocolLevel: Number(parsedRequester.data.protocolLevel), organisationId: parsedRequester.data.organisationId || undefined, organisationName: parsedRequester.data.organisationId ? undefined : parsedRequester.data.organisationName, email: parsedRequester.data.email || undefined }) })
        const body: unknown = await result.json()
        if (!result.ok) throw new Error(apiError(body, "Unable to create requester; the request was not created"))
        selectedRequesterId = (body as { requester: RequesterOption }).requester.id
        createdRequester = true
      }
      const result = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: parsedRequest.data.matchId,
          requesterId: selectedRequesterId,
          source: parsedRequest.data.source,
          priority: parsedRequest.data.priority,
          status,
          preferredType: parsedRequest.data.ticketType,
          ...(parsedRequest.data.sourceReference ? { sourceReference: parsedRequest.data.sourceReference } : {}),
          ...(parsedRequest.data.purpose ? { purpose: parsedRequest.data.purpose } : {}),
          ...(parsedRequest.data.requiredDeliveryMethod ? { requiredDeliveryMethod: parsedRequest.data.requiredDeliveryMethod } : {}),
          ...(parsedRequest.data.specialInstructions ? { specialInstructions: parsedRequest.data.specialInstructions } : {}),
          items: lines.map((line, index) => ({ ticketCategoryId: line.ticketCategoryId, requestedQuantity: Number(line.requestedQuantity), priority: index, ...(line.notes.trim() ? { notes: line.notes.trim() } : {}) })),
        }),
      })
      const body: unknown = await result.json()
      if (!result.ok) throw new Error(`${apiError(body, "Unable to create request")}${createdRequester ? " The new requester was created; switch to “Existing requester”, refresh the list and select them before retrying." : ""}`)
      const created = body as CreatedRequest
      if (!created.id) throw new Error("The server did not return the created request ID")
      router.push(`/requests/${created.id}`)
    } catch (error: unknown) {
      setFormError(errorMessage(error))
      setSavingStatus("")
    }
  }

  return (
    <MainLayout><div className="mx-auto max-w-5xl space-y-6">
      <div><Button variant="ghost" size="sm" asChild><Link href="/requests"><ArrowLeft className="mr-2 h-4 w-4" />Back to requests</Link></Button><h1 className="mt-2 text-3xl font-bold tracking-tight">New ticket request</h1><p className="text-muted-foreground">Record the requester, source and ticket quantities. Save a draft or submit for processing.</p></div>
      {!sessionLoading && !canWrite ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Access unavailable</AlertTitle><AlertDescription>Your account does not have permission to create requests.</AlertDescription></Alert> : loading ? <Loading label="Loading matches and requesters" /> : loadError ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Could not prepare the request form</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3"><span>{loadError}</span><Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Try again</Button></AlertDescription></Alert> : <form onSubmit={(event) => { event.preventDefault(); void saveRequest("DRAFT") }} className="space-y-6">
        {formError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Request not saved</AlertTitle><AlertDescription>{formError}</AlertDescription></Alert>}
        <Card><CardHeader><CardTitle>Match and request details</CardTitle><CardDescription>Choose the event and tell us how the request was received.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="new-request-match">Match *</Label><select id="new-request-match" className={selectClassName} required value={requestForm.matchId} onChange={(event) => setRequestForm({ ...requestForm, matchId: event.target.value, ticketType: "" })}><option value="">Select a match</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.title} — {formatDate(match.matchDate)} ({match.venue.name})</option>)}</select>{matches.length === 0 && <p className="text-sm text-muted-foreground">No matches are available. A match must be configured before requesting tickets.</p>}</div>
          <Field id="new-request-source" label="Request source" required><select id="new-request-source" className={selectClassName} value={requestForm.source} onChange={(event) => updateRequest("source", event.target.value as RequestForm["source"])}>{sources.map((source) => <option key={source} value={source}>{formatStatus(source)}</option>)}</select></Field>
          <Field id="new-request-priority" label="Priority" required><select id="new-request-priority" className={selectClassName} value={requestForm.priority} onChange={(event) => updateRequest("priority", event.target.value as RequestForm["priority"])}>{priorities.map((priority) => <option key={priority} value={priority}>{formatStatus(priority)}</option>)}</select></Field>
          <Field id="new-request-ticket-type" label="Ticket type" required><select id="new-request-ticket-type" className={selectClassName} value={requestForm.ticketType} onChange={(event) => updateRequest("ticketType", event.target.value as RequestForm["ticketType"])}><option value="">{inventoryPurpose ? `From inventory: ${formatStatus(inventoryPurpose)}` : "Choose a ticket type"}</option><option value="COMPLIMENTARY">Complimentary</option><option value="PURCHASE">Purchase</option></select></Field>
          <Field id="new-request-reference" label="Source reference"><Input id="new-request-reference" value={requestForm.sourceReference} onChange={(event) => updateRequest("sourceReference", event.target.value)} maxLength={500} placeholder="Letter, email or reference number" /></Field>
          <Field id="new-request-delivery" label="Required delivery method"><select id="new-request-delivery" className={selectClassName} value={requestForm.requiredDeliveryMethod} onChange={(event) => updateRequest("requiredDeliveryMethod", event.target.value as RequestForm["requiredDeliveryMethod"])}><option value="">No preference</option><option value="PHYSICAL">Physical</option><option value="DIGITAL">Digital</option><option value="BOTH">Both</option></select></Field>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Requester</CardTitle><CardDescription>Select an existing contact or create and use a new one.</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="flex gap-2" role="group" aria-label="Requester selection mode"><Button type="button" variant={requesterMode === "existing" ? "default" : "outline"} onClick={() => setRequesterMode("existing")}>Existing requester</Button><Button type="button" variant={requesterMode === "new" ? "default" : "outline"} onClick={() => setRequesterMode("new")}>New requester</Button></div>
          {requesterMode === "existing" ? <div className="flex items-end gap-2"><div className="flex-1"><Field id="new-request-requester" label="Requester" required><select id="new-request-requester" className={selectClassName} value={requesterId} onChange={(event) => setRequesterId(event.target.value)} required><option value="">Select a requester</option>{requesters.map((requester) => <option key={requester.id} value={requester.id}>{requester.fullName} — {requester.organisation?.name || requester.mobileNumber}</option>)}</select></Field></div><Button type="button" variant="outline" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}>Refresh list</Button></div> : <div className="grid gap-4 sm:grid-cols-2">
            <Field id="inline-requester-name" label="Full name" required><Input id="inline-requester-name" value={requesterForm.fullName} onChange={(event) => updateRequester("fullName", event.target.value)} maxLength={150} /></Field><Field id="inline-requester-mobile" label="Mobile number" required><Input id="inline-requester-mobile" type="tel" value={requesterForm.mobileNumber} onChange={(event) => updateRequester("mobileNumber", event.target.value)} placeholder="+91 98765 43210" /></Field>
            <Field id="inline-requester-email" label="Email"><Input id="inline-requester-email" type="email" value={requesterForm.email} onChange={(event) => updateRequester("email", event.target.value)} /></Field><Field id="inline-requester-designation" label="Designation"><Input id="inline-requester-designation" value={requesterForm.designation} onChange={(event) => updateRequester("designation", event.target.value)} maxLength={150} /></Field>
            <Field id="inline-requester-organisation" label="Existing organisation"><select id="inline-requester-organisation" className={selectClassName} value={requesterForm.organisationId} onChange={(event) => updateRequester("organisationId", event.target.value)}><option value="">Create or enter an organisation</option>{organisations.map((organisation) => <option key={organisation.id} value={organisation.id}>{organisation.name}</option>)}</select></Field>
            {!requesterForm.organisationId && <Field id="inline-requester-organisation-name" label="New organisation name" required><Input id="inline-requester-organisation-name" value={requesterForm.organisationName} onChange={(event) => updateRequester("organisationName", event.target.value)} maxLength={200} /></Field>}
            <Field id="inline-requester-category" label="Requester category" required><select id="inline-requester-category" className={selectClassName} value={requesterForm.requesterCategory} onChange={(event) => updateRequester("requesterCategory", event.target.value)}><option value="">Select</option>{requesterCategories.map((category) => <option key={category} value={category}>{formatStatus(category)}</option>)}</select></Field>
            <Field id="inline-requester-protocol" label="Protocol level"><Input id="inline-requester-protocol" type="number" min={0} max={10} value={requesterForm.protocolLevel} onChange={(event) => updateRequester("protocolLevel", event.target.value)} /></Field>
            <Field id="inline-requester-contact" label="Preferred contact"><select id="inline-requester-contact" className={selectClassName} value={requesterForm.contactPreference} onChange={(event) => updateRequester("contactPreference", event.target.value as RequesterForm["contactPreference"])}><option value="PHONE">Phone</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select></Field>
          </div>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Requested tickets</CardTitle><CardDescription>Add one line per category. Each line needs a positive whole-number quantity.</CardDescription></CardHeader><CardContent className="space-y-4">
          {categoryError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{categoryError}</AlertDescription></Alert>}
          {!requestForm.matchId ? <p className="text-sm text-muted-foreground">Select a match to see its ticket categories.</p> : categoriesLoading ? <Loading label="Loading ticket categories" /> : !categoryError && categories.length === 0 ? <p className="text-sm text-muted-foreground">This match has no active ticket categories. Configure categories before creating a request.</p> : lines.map((line, index) => <div key={line.key} className="grid items-end gap-3 rounded-lg border p-4 md:grid-cols-[minmax(180px,1fr)_130px_minmax(160px,1fr)_40px]">
            <Field id={`category-${line.key}`} label={`Category ${index + 1}`} required><select id={`category-${line.key}`} className={selectClassName} value={line.ticketCategoryId} onChange={(event) => updateLine(line.key, { ticketCategoryId: event.target.value })} required><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.displayName}{availability[category.id] ? ` (${availability[category.id].remaining} available)` : ""}</option>)}</select>{line.ticketCategoryId && availability[line.ticketCategoryId] && <p className={`text-xs ${availability[line.ticketCategoryId].remaining < Number(line.requestedQuantity || 0) ? "text-destructive" : "text-muted-foreground"}`}>{availability[line.ticketCategoryId].remaining} of {availability[line.ticketCategoryId].capacity} available · {availability[line.ticketCategoryId].allocated} already allocated{availability[line.ticketCategoryId].remaining < Number(line.requestedQuantity || 0) ? " — insufficient availability" : ""}</p>}</Field>
            <Field id={`quantity-${line.key}`} label="Quantity" required><Input id={`quantity-${line.key}`} type="number" min={1} step={1} required value={line.requestedQuantity} onChange={(event) => updateLine(line.key, { requestedQuantity: event.target.value })} /></Field>
            <Field id={`notes-${line.key}`} label="Line notes"><Input id={`notes-${line.key}`} value={line.notes} onChange={(event) => updateLine(line.key, { notes: event.target.value })} maxLength={2000} /></Field>
            <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1 || Boolean(savingStatus)} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} aria-label={`Remove category ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
          {requestForm.matchId && !categoriesLoading && categories.length > 0 && <Button type="button" variant="outline" onClick={addLine} disabled={lines.length >= categories.length}><Plus className="mr-2 h-4 w-4" />Add category</Button>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Additional information</CardTitle></CardHeader><CardContent className="space-y-4"><Field id="new-request-purpose" label="Purpose"><Textarea id="new-request-purpose" value={requestForm.purpose} onChange={(event) => updateRequest("purpose", event.target.value)} maxLength={2000} /></Field><Field id="new-request-instructions" label="Special instructions"><Textarea id="new-request-instructions" value={requestForm.specialInstructions} onChange={(event) => updateRequest("specialInstructions", event.target.value)} maxLength={2000} /></Field></CardContent></Card>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" asChild><Link href="/requests">Cancel</Link></Button><Button type="button" variant="secondary" disabled={Boolean(savingStatus) || matches.length === 0} onClick={() => void saveRequest("DRAFT")}>{savingStatus === "DRAFT" ? "Saving draft…" : "Save as draft"}</Button><Button type="submit" disabled={Boolean(savingStatus) || matches.length === 0} onClick={(event) => { event.preventDefault(); void saveRequest("SUBMITTED") }}>{savingStatus === "SUBMITTED" ? "Submitting…" : "Submit request"}</Button></div>
      </form>}
    </div></MainLayout>
  )
}

interface FieldProps { id: string; label: string; required?: boolean; children: React.ReactNode }
function Field({ id, label, required, children }: FieldProps) { return <div className="space-y-2"><Label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</Label>{children}</div> }
function Loading({ label }: { label: string }) { return <div className="flex h-40 items-center justify-center" role="status"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /><span className="sr-only">{label}</span></div> }
function apiError(body: unknown, fallback: string): string { return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : fallback }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unexpected error" }
