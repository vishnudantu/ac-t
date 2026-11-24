"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter()
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/login")
    router.refresh()
  }

  return <Button variant="ghost" size={collapsed ? "icon" : "sm"} className="w-full" onClick={signOut} aria-label="Sign out" title="Sign out">
    <LogOut className="h-4 w-4" aria-hidden="true" />{!collapsed && <span className="ml-2">Sign out</span>}
  </Button>
}
