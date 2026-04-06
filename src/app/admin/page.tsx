import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { AdminDashboard } from '@/components/admin-dashboard'
import { isAdminHost } from '@/lib/admin/control-plane'
import {
  getAdminLoginConfig,
  getAdminSessionFromCookies,
} from '@/lib/admin/session.server'
import { readTenantRegistry } from '@/lib/tenants/registry.server'

export default async function AdminPage() {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')

  if (!isAdminHost(host)) {
    notFound()
  }

  const session = await getAdminSessionFromCookies()
  if (!session) {
    redirect('/admin/login')
  }

  const tenants = await readTenantRegistry()

  return (
    <AdminDashboard
      adminEmail={session.email}
      authConfig={getAdminLoginConfig()}
      initialTenants={tenants}
    />
  )
}
