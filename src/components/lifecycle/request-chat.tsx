"use client"

import * as React from "react"
import { MessageSquare, Send } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/utils"

interface Comment {
  id: string
  content: string
  createdAt: string
  author: { id: string; fullName: string; designation: string | null }
}

export function RequestChat({ requestId, canWrite }: { requestId: string; canWrite: boolean }) {
  const [comments, setComments] = React.useState<Comment[]>([])
  const [draft, setDraft] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState("")

  const load = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/comments`, { cache: "no-store" })
      const body = await response.json() as { comments?: Comment[]; error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to load comments")
      setComments(body.comments || [])
      setError("")
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to load comments")
    } finally {
      setLoading(false)
    }
  }, [requestId])

  React.useEffect(() => { void load() }, [load])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    setError("")
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: draft.trim() }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to send message")
      setDraft("")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to send message")
    } finally {
      setSending(false)
    }
  }

  return <Card className="shadow-none">
    <CardHeader className="p-4 pb-3"><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Clarification chat</CardTitle><p className="text-xs text-muted-foreground">Discuss this request with the approver and staff. Internal only.</p></CardHeader>
    <CardContent className="space-y-3 p-4 pt-0">
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading messages…</p>
          : comments.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet. Ask for clarification or guidance below.</p>
          : comments.map((comment) => <div key={comment.id} className="rounded-md bg-muted/60 p-2.5">
            <p className="text-xs font-medium">{comment.author.fullName}{comment.author.designation ? ` · ${comment.author.designation}` : ""}<span className="ml-2 font-normal text-muted-foreground">{formatDateTime(comment.createdAt)}</span></p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
          </div>)}
      </div>
      {canWrite && <form onSubmit={send} className="flex items-end gap-2">
        <Textarea rows={2} maxLength={2000} placeholder="Ask for clarification or leave guidance…" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={sending} className="flex-1" />
        <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Send message"><Send className="h-4 w-4" /></Button>
      </form>}
    </CardContent>
  </Card>
}
