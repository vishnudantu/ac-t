"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Users,
  Ticket,
  Package,
  Truck,
  Shield,
  Settings,
  BarChart3,
  ClipboardList,
  FolderOpen,
  Key,
  Bell,
  UserCog,
  Database,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"

const navigation = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Matches",
    href: "/matches",
    icon: Calendar,
  },
  {
    title: "Requests",
    href: "/requests",
    icon: FileText,
  },
  {
    title: "Approvals",
    href: "/approvals",
    icon: ClipboardList,
  },
  {
    title: "Allocations",
    href: "/allocations",
    icon: Package,
  },
  {
    title: "Distribution",
    href: "/distribution",
    icon: Truck,
  },
  {
    title: "Inventory",
    href: "/inventory",
    icon: Ticket,
  },
  {
    title: "Quotas",
    href: "/quotas",
    icon: Shield,
  },
  {
    title: "Requesters",
    href: "/requesters",
    icon: Users,
  },
  {
    title: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    title: "Audit Logs",
    href: "/audit",
    icon: Database,
  },
  {
    title: "Notifications",
    href: "/notifications",
    icon: Bell,
  },
  {
    title: "Administration",
    href: "/admin",
    icon: Settings,
    items: [
      { title: "Users", href: "/admin/users", icon: UserCog },
      { title: "Roles & Permissions", href: "/admin/roles", icon: Shield },
      { title: "System Settings", href: "/admin/settings", icon: Settings },
      { title: "Import/Export", href: "/admin/import-export", icon: FolderOpen },
      { title: "Notification Templates", href: "/admin/notifications", icon: Bell },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useSession()
  const [collapsed, setCollapsed] = React.useState(false)

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  const hasAccess = (item: typeof navigation[0]) => {
    if (!user) return false
    const permissions = user.permissions || []

    // Admin items require admin permissions
    if (item.href === "/admin") {
      return permissions.includes("users:read") || permissions.includes("settings:read")
    }

    // Match admin items
    if (["/matches", "/inventory", "/quotas", "/allocations"].includes(item.href)) {
      return permissions.includes("matches:read") || permissions.includes("inventory:read") || permissions.includes("quotas:read")
    }

    // Approval items
    if (item.href === "/approvals") {
      return permissions.includes("approvals:read") || permissions.includes("approvals:decide")
    }

    // Distribution items
    if (item.href === "/distribution") {
      return permissions.includes("distribution:read") || permissions.includes("distribution:issue")
    }

    // Reports
    if (item.href === "/reports") {
      return permissions.includes("reports:read")
    }

    // Audit
    if (item.href === "/audit") {
      return permissions.includes("audit:read")
    }

    // Requesters
    if (item.href === "/requesters") {
      return permissions.includes("requests:read")
    }

    // Default access for basic items
    return true
  }

  const filteredNav = navigation.filter(item => hasAccess(item))

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-lg">ACA TicketOps</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className={cn("h-8 w-8", collapsed && "ml-auto")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1" role="navigation" aria-label="Main navigation">
        {filteredNav.map((item) => {
          const active = isActive(item.href)
          const hasChildren = item.items && item.items.length > 0

          if (hasChildren) {
            return (
              <Collapsible key={item.href} open={active}>
                <CollapsibleTrigger className="w-full">
                  <Button
                    variant={active ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-2",
                      !collapsed && "text-left"
                    )}
                    asChild
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />}
                    </Link>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className={cn("pt-2", collapsed && "hidden")}>
                  {item.items!.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive(child.href)
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <child.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span>{child.title}</span>}
                    </Link>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.title : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" asChild>
              <Link href="/profile">Profile</Link>
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => {}}>Logout</Button>
          </div>
        )}
      </div>
    </aside>
  )
}