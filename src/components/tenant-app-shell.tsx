'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Card } from '@/components/ui/card'
import { Sidebar } from '@/components/sidebar'
import { TopNav } from '@/components/top-nav'
import { isAdminHost } from '@/lib/admin/control-plane'
import { useTenantRuntime } from '@/lib/tenants/runtime-context'

export function TenantAppShell({
  children,
}: {
  children: ReactNode
}) {
  const [browserHost, setBrowserHost] = useState('')
  const tenant = useTenantRuntime()
  const adminControlPlane = browserHost ? isAdminHost(browserHost) : false

  useEffect(() => {
    setBrowserHost(window.location.host)
  }, [])

  if (adminControlPlane) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-lg p-8 border-border/60 text-center space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">OZRYN Control Plane</h1>
            <p className="text-sm text-muted-foreground">
              This host is reserved for platform operator workflows and tenant provisioning.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Admin Control Plane
          </Link>
        </Card>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-lg p-8 border-border/60 text-center space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">Select a tenant to continue</h1>
            <p className="text-sm text-muted-foreground">
              OZRYN now resolves Medplum at runtime per tenant. Sign in through the tenant-aware
              login screen to choose the correct workspace.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Login
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
