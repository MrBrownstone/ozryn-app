import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { AdminDashboard } from '@/components/admin-dashboard'
import { listTenantRecords } from '@/db/tenant-repository'
import { isAdminHost } from '@/lib/admin/control-plane'
import {
  getAdminLoginConfig,
  getAdminSessionFromCookies,
} from '@/lib/admin/session.server'

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

  const tenants = await listTenantRecords()

  return (
    <AdminDashboard
      adminEmail={session.email}
      authConfig={getAdminLoginConfig()}
      initialTenants={tenants}
    />
  )
}
