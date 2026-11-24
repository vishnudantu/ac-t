"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Calendar, FileText, Users, Ticket, Package, Truck, Shield, Settings, BarChart3, ClipboardList, FolderOpen, Bell, UserCog, Database, ChevronLeft, ChevronRight, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"
import { LogoutButton } from "./logout-button"

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

const navigation = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Matches", href: "/matches", icon: Calendar, permission: "matches:read" },
  { title: "Venues", href: "/admin/venues", icon: Building2, permission: "matches:read" },
  { title: "Requests", href: "/requests", icon: FileText, permission: "requests:read" },
  { title: "Approvals", href: "/approvals", icon: ClipboardList, permission: "approvals:read" },
  { title: "Allocations", href: "/allocations", icon: Package, permission: "allocations:read" },
  { title: "Distribution", href: "/distribution", icon: Truck, permission: "distribution:read" },
  { title: "Inventory", href: "/inventory", icon: Ticket, permission: "inventory:read" },
  { title: "Quotas", href: "/quotas", icon: Shield, permission: "quotas:read" },
  { title: "Requesters", href: "/requesters", icon: Users, permission: "requests:read" },
  { title: "Reports", href: "/reports", icon: BarChart3, permission: "reports:read" },
  { title: "Audit Logs", href: "/audit", icon: Database, permission: "audit:read" },
  { title: "Notifications", href: "/notifications", icon: Bell, permission: "notifications:read" },
  { title: "User Administration", href: "/admin/users", icon: UserCog, permission: "users:read" },
  { title: "Roles & Permissions", href: "/admin/roles", icon: Shield, permission: "roles:read" },
  { title: "System Settings", href: "/admin/settings", icon: Settings, permission: "settings:read" },
  { title: "Import / Export", href: "/admin/import-export", icon: FolderOpen, permission: "requests:bulk_import" },
]

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useSession()
  const [collapsed, setCollapsed] = React.useState(false)
  const filteredNav = navigation.filter((item) => !item.permission || user?.permissions.includes(item.permission))

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-50 flex h-dvh flex-col border-r bg-card transition-[width,transform] duration-200",
      collapsed ? "w-16" : "w-64",
      mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )} aria-label="Application navigation">
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        {!collapsed && <Link href="/dashboard" className="flex min-w-0 items-center gap-2" onClick={onClose}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Ticket className="h-4 w-4" /></div>
          <span className="truncate font-semibold">ACA TicketOps</span>
        </Link>}
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className={cn("hidden lg:flex", collapsed && "mx-auto")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Main navigation">
        <ul className="space-y-1">
          {filteredNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return <li key={item.href}>
              <Link href={item.href} onClick={onClose} aria-current={active ? "page" : undefined} title={collapsed ? item.title : undefined} className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center px-2"
              )}>
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            </li>
          })}
        </ul>
      </nav>
      <div className="shrink-0 border-t p-4">
        {!collapsed && <div className="mb-3 min-w-0"><Link href="/profile" onClick={onClose} className="block rounded-md p-1 -m-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Profile & password"><p className="truncate text-sm font-medium">{user?.fullName || "Signed-in user"}</p><p className="truncate text-xs text-muted-foreground">{user?.email || ""}</p></Link></div>}
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  )
}
