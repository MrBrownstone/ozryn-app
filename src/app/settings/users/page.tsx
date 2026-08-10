import { TenantAppShell } from '@/components/tenant-app-shell'
import { TenantUsersAdmin } from '@/components/tenant-users-admin'

export default function TenantUsersPage() {
  return (
    <TenantAppShell>
      <TenantUsersAdmin />
    </TenantAppShell>
  )
}
