"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface SearchResult {
  type: string
  id: string
  title: string
  subtitle: string
  href: string
}

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  React.useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setLoading(false); setError(""); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" })
        const body = await response.json() as { results?: SearchResult[]; error?: string }
        if (!response.ok) throw new Error(body.error || "Search failed")
        setResults(body.results || [])
      } catch (cause: unknown) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Search failed")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [query])

  function go(result: SearchResult) {
    setOpen(false)
    setQuery("")
    setResults([])
    router.push(result.href)
  }

  return <>
    <Button variant="outline" size="icon" onClick={() => setOpen(true)} className="gap-2 text-muted-foreground sm:h-9 sm:w-auto sm:px-3" aria-label="Search requests, requesters and matches">
      <Search className="h-4 w-4" /><span className="hidden md:inline">Search…</span><kbd className="hidden rounded border px-1 text-[10px] font-normal md:inline">⌘K</kbd>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0">
        <div className="border-b p-3">
          <Input autoFocus placeholder="Search requests, requesters, matches…" value={query} onChange={(event) => setQuery(event.target.value)} className="border-0 focus-visible:ring-0" />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {loading && <p className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Searching…</p>}
          {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && <p className="p-4 text-sm text-muted-foreground">No results for “{query}”.</p>}
          {results.map((result) => <button key={`${result.type}-${result.id}`} type="button" onClick={() => go(result)} className="flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="mt-0.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">{result.type}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span></span>
          </button>)}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
