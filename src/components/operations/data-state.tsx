"use client"

import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SkeletonProps {
  rows?: number
  className?: string
}

export function TableSkeleton({ rows = 6, className }: SkeletonProps) {
  return (
    <div className={cn("space-y-1 p-4", className)} role="status" aria-label="Loading data">
      <span className="sr-only">Loading data. Please wait.</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid h-14 animate-pulse grid-cols-[1.5fr_1fr_1fr_0.75fr] items-center gap-5 border-b px-2 last:border-0"
          aria-hidden="true"
        >
          <div className="space-y-2">
            <div className="h-3 w-4/5 rounded bg-muted" />
            <div className="h-2.5 w-3/5 rounded bg-muted" />
          </div>
          <div className="h-3 rounded bg-muted" />
          <div className="h-3 rounded bg-muted" />
          <div className="h-6 w-20 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function MetricSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading totals">
      <span className="sr-only">Loading totals. Please wait.</span>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} aria-hidden="true">
          <CardContent className="flex animate-pulse items-center justify-between p-5">
            <div className="space-y-3">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-7 w-16 rounded bg-muted" />
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  error: string
  onRetry: () => void
  loading?: boolean
}

export function ErrorState({ title = "Unable to load data", error, onRetry, loading }: ErrorStateProps) {
  return (
    <Card className="border-destructive/30" role="alert">
      <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <div className="rounded-lg bg-destructive/10 p-2 text-destructive" aria-hidden="true">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">Check your connection and permissions, then try again.</p>
        </div>
        <Button type="button" variant="outline" onClick={onRetry} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          {loading ? "Retrying…" : "Retry"}
        </Button>
      </CardContent>
    </Card>
  )
}

interface EmptyStateProps {
  title: string
  description: string
  action?: React.ReactNode
  icon?: React.ReactNode
  onClear?: () => void
}

export function EmptyState({ title, description, action, icon, onClear }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground/60" aria-hidden="true">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {onClear && (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

interface DataStateProps {
  loading: boolean
  error: string | null
  onRetry: () => void
  children: React.ReactNode
  skeleton?: React.ReactNode
}

export function DataState({ loading, error, onRetry, children, skeleton }: DataStateProps) {
  if (error) return <ErrorState error={error} onRetry={onRetry} loading={loading} />
  if (loading) return <>{skeleton ?? <Card><TableSkeleton /></Card>}</>
  return <>{children}</>
}
