import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description: string
  eyebrow?: string
  actions?: React.ReactNode
  onRefresh?: () => void
  refreshing?: boolean
}

export function PageHeader({
  title,
  description,
  eyebrow = "Operations",
  actions,
  onRefresh,
  refreshing,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {onRefresh && (
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
        )}
        {actions}
      </div>
    </div>
  )
}
