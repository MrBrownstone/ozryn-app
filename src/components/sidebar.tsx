"use client"

import { Home, Users, Calendar, FileText, Settings, LogOut, Activity, ChevronLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { medplum } from "@/lib/medplum"

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const router = useRouter()

  const menuItems = [
    { icon: Home, label: "Dashboard", href: "#" },
    { icon: Users, label: "Patients", href: "#" },
    { icon: Activity, label: "Observations", href: "#" },
    { icon: Calendar, label: "Appointments", href: "#" },
    { icon: FileText, label: "Care Plans", href: "#" },
  ]

  const handleLogout = async () => {
    setSigningOut(true)

    try {
      await medplum.signOut()
    } catch (error) {
      console.warn("Medplum sign out failed, clearing local session only.", error)
      medplum.clear()
    } finally {
      router.replace("/login")
      router.refresh()
      setSigningOut(false)
    }
  }

  return (
    <aside
      className={`${collapsed ? "w-20" : "w-64"} bg-white border-r border-border transition-all duration-300 flex flex-col sticky top-0 h-screen`}
    >
      {/* Logo */}
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-cyan-600 to-teal-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">Ω</span>
          </div>
          {!collapsed && <span className="font-bold text-foreground text-lg">OZRYN</span>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-8 w-8">
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 rounded-md text-foreground hover:bg-cyan-50 hover:text-cyan-700 transition-colors group"
          >
            <item.icon className="w-5 h-5 shrink-0 group-hover:text-cyan-600" />
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-2">
        <Button variant="ghost" className="w-full justify-start gap-3 px-4 h-10">
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Settings</span>}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-4 h-10"
          onClick={handleLogout}
          disabled={signingOut}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">{signingOut ? "Logging out..." : "Logout"}</span>}
        </Button>
      </div>
    </aside>
  )
}
