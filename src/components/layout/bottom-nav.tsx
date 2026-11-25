"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, FileText, ClipboardList, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSession } from "@/hooks/use-session"

export function BottomNav() {
  const pathname = usePathname()
  const { user } = useSession()
  const items = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    ...(user?.permissions.includes("requests:read") ? [{ href: "/requests", label: "Requests", icon: FileText }] : []),
    ...(user?.permissions.includes("approvals:read") ? [{ href: "/approvals", label: "Approvals", icon: ClipboardList }] : []),
    { href: "/profile", label: "Profile", icon: User },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden" aria-label="Primary">
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return <li key={item.href} className="flex-1">
            <Link href={item.href} className={cn("flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")} aria-current={active ? "page" : undefined}>
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        })}
      </ul>
    </nav>
  )
}
