"use client"

import { useId } from "react"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatNumber } from "@/lib/utils"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}

export function SearchInput({ value, onChange, placeholder, label }: SearchInputProps) {
  const id = useId()
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-md">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id={id}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
      />
    </div>
  )
}

interface FilterSelectProps {
  value: string
  onChange: (value: string) => void
  label: string
  options: readonly { value: string; label: string }[]
}

export function FilterSelect({ value, onChange, label, options }: FilterSelectProps) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 max-w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  itemCount: number
  onPageChange: (page: number) => void
  filtered?: boolean
}

export function Pagination({ page, pageSize, total, itemCount, onPageChange, filtered }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <nav className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered
          ? <>Showing {formatNumber(itemCount)} filtered records from this page. Search applies to this page only.</>
          : total > 0
            ? <>Showing {formatNumber(start)}–{formatNumber(end)} of {formatNumber(total)} records.</>
            : <>No records to display.</>}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={filtered || page <= 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Previous
        </Button>
        <span className="min-w-20 text-center text-xs text-muted-foreground">Page {page} of {totalPages}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={filtered || page >= totalPages}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
