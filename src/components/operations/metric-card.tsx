import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn, formatNumber } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  description?: string
  tone?: "default" | "green" | "blue" | "amber" | "violet" | "red"
}

const tones = {
  default: "bg-muted text-foreground",
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
}

export function MetricCard({ label, value, icon: Icon, description, tone = "default" }: MetricCardProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{typeof value === "number" ? formatNumber(value) : value}</p>
          {description && <p className="mt-1 text-xs leading-4 text-muted-foreground">{description}</p>}
        </div>
        <div className={cn("shrink-0 rounded-lg p-2.5", tones[tone])} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}
