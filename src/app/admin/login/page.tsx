import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { AdminLoginForm } from '@/components/admin-login-form'
import { isAdminHost } from '@/lib/admin/control-plane'
import {
  getAdminLoginConfig,
  getMissingAdminLoginEnvVars,
  getAdminSessionFromCookies,
  isAdminLoginConfigured,
} from '@/lib/admin/session.server'

export default async function AdminLoginPage() {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')

  if (!isAdminHost(host)) {
    notFound()
  }

  const session = await getAdminSessionFromCookies()
  if (session) {
    redirect('/admin')
  }

  return (
    <AdminLoginForm
      configured={isAdminLoginConfigured()}
      authConfig={getAdminLoginConfig()}
      missingEnvVars={getMissingAdminLoginEnvVars()}
    />
  )
}
