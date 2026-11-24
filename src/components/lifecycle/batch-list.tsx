"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, PackageOpen, Send } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/operations/data-state"
import { formatDate, formatNumber, formatStatus, getStatusColor } from "@/lib/utils"
import type { DistributionBatch } from "./types"

interface BatchListProps {
  batches: DistributionBatch[]
  canIssue: boolean
  filtered: boolean
  onClear: () => void
  onIssue: (batchId: string) => void
}

export function BatchList({ batches, canIssue, filtered, onClear, onIssue }: BatchListProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (batches.length === 0) return <Card className="shadow-none"><EmptyState icon={<PackageOpen className="h-10 w-10" />} title={filtered ? "No matching batches" : "No distribution batches"} description={filtered ? "No batches on this page match your filters." : "Create a batch or issue from a confirmed allocation to begin distribution."} onClear={filtered ? onClear : undefined} /></Card>

  return <div className="space-y-3">{batches.map((batch) => {
    const isOpen = expanded === batch.id
    const issued = batch.issuances.filter((issuance) => !["CANCELLED", "RETURNED"].includes(issuance.status)).reduce((sum, issuance) => sum + issuance.quantity, 0)
    return <Card key={batch.id} className="shadow-none"><CardContent className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-all font-mono text-sm font-semibold">{batch.batchNumber}</h2><Badge className={getStatusColor(batch.status)}>{formatStatus(batch.status)}</Badge><Badge variant="outline">{formatStatus(batch.distributionMethod)}</Badge></div><p className="mt-2 text-sm font-medium">{batch.match.title}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(batch.match.matchDate)} · Officer: {batch.officer?.fullName ?? "Not assigned"} · Created {formatDate(batch.createdAt)}</p>{batch.notes && <p className="mt-2 text-sm text-muted-foreground">{batch.notes}</p>}</div>
        <dl className="grid shrink-0 grid-cols-3 gap-4 border-y py-3 lg:border-x lg:border-y-0 lg:px-5 lg:py-0"><div><dt className="text-xs text-muted-foreground">Issuances</dt><dd className="mt-1 text-xl font-bold tabular-nums">{batch.issuances.length}</dd></div><div><dt className="text-xs text-muted-foreground">Tickets issued</dt><dd className="mt-1 text-xl font-bold tabular-nums">{formatNumber(issued)}</dd></div><div><dt className="text-xs text-muted-foreground">Delivered</dt><dd className="mt-1 text-xl font-bold tabular-nums">{formatNumber(batch.deliveredTickets)}</dd></div></dl>
        <div className="flex shrink-0 flex-wrap gap-2">{canIssue && !["COMPLETED", "CANCELLED"].includes(batch.status) && <Button size="sm" onClick={() => onIssue(batch.id)}><Send className="mr-2 h-4 w-4" />Issue to batch</Button>}<Button size="sm" variant="outline" aria-expanded={isOpen} aria-controls={`issuances-${batch.id}`} onClick={() => setExpanded(isOpen ? null : batch.id)}>{isOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}{batch.issuances.length} issuances</Button></div>
      </div>
      {isOpen && <div id={`issuances-${batch.id}`} className="mt-4 overflow-hidden rounded-md border">{batch.issuances.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No issuances recorded in this batch.</p> : <Table><TableHeader><TableRow><TableHead scope="col">Issuance / recipient</TableHead><TableHead scope="col">Category / location</TableHead><TableHead scope="col" className="text-right">Quantity</TableHead><TableHead scope="col">Method / date</TableHead><TableHead scope="col">Serials / seats</TableHead></TableRow></TableHeader><TableBody>{batch.issuances.map((issuance) => <TableRow key={issuance.id}><TableCell><p className="break-all font-mono text-xs font-medium">{issuance.issuanceNumber}</p><p className="mt-1 text-sm">{issuance.recipientName}</p>{issuance.recipientMobile && <p className="text-xs text-muted-foreground">{issuance.recipientMobile}</p>}</TableCell><TableCell><p>{issuance.ticketCategory}</p><p className="text-xs text-muted-foreground">{issuance.standName}{issuance.blockName ? ` · ${issuance.blockName}` : ""}</p></TableCell><TableCell className="text-right font-medium tabular-nums">{issuance.quantity}</TableCell><TableCell><Badge variant="outline">{formatStatus(issuance.distributionMethod)}</Badge><p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{formatDate(issuance.issuedAt)}</p></TableCell><TableCell className="max-w-[240px]"><p className="break-words text-xs">{issuance.serialNumbers.length ? issuance.serialNumbers.join(", ") : "No serials recorded"}</p>{issuance.seatDetails && <p className="mt-1 break-words text-xs text-muted-foreground">{issuance.seatDetails}</p>}</TableCell></TableRow>)}</TableBody></Table>}</div>}
    </CardContent></Card>
  })}</div>
}
