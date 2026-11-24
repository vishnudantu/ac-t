"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { postLifecycle } from "./client"
import type { AllocationRecord } from "./types"

interface AllocationConfirmationProps {
  allocation: AllocationRecord
  onConfirmed: () => Promise<void>
}

export function AllocationConfirmation({ allocation, onConfirmed }: AllocationConfirmationProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (allocation.status !== "DRAFT") return null

  async function confirm() {
    setSubmitting(true)
    setError(null)
    try {
      await postLifecycle(`/api/allocations/${encodeURIComponent(allocation.id)}/confirm`, {})
      await onConfirmed()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm allocation.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={() => { void confirm() }}>
        <CheckCircle2 className="mr-2 h-4 w-4" />{submitting ? "Confirming…" : `Confirm ${allocation.allocationNumber}`}
      </Button>
      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
  )
}
