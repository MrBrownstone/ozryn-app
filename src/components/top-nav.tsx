"use client"

import { Search, Bell, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

import { useTenantRuntime } from "@/lib/tenants/runtime-context"

export function TopNav() {
  const tenant = useTenantRuntime()

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="text" placeholder="Search patients..." className="pl-10" />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4 ml-6">
          {tenant ? (
            <div className="hidden md:flex items-center rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
              {tenant.displayName}
            </div>
          ) : null}

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
          </Button>

          <div className="w-px h-6 bg-border"></div>

          <Button variant="ghost" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-linear-to-br from-primary to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
              DR
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </header>
  )
}
