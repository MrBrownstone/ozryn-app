'use client'

import { MedplumProvider } from '@medplum/react'
import type { ReactNode } from 'react'
import { MantineProvider, createTheme } from '@mantine/core'

import { configureTenantMedplum } from '@/lib/medplum'
import { TenantRuntimeProvider } from '@/lib/tenants/runtime-context'
import type { TenantRuntimeConfig } from '@/lib/tenants/types'

const theme = createTheme({
  fontFamily: 'var(--font-sans)',
})

export default function Providers({
  children,
  tenant,
}: {
  children: ReactNode
  tenant: TenantRuntimeConfig | null
}) {
  const medplum = tenant ? configureTenantMedplum(tenant) : null

  const content = medplum ? (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  ) : (
    children
  )

  return (
    <MantineProvider theme={theme}>
      <TenantRuntimeProvider tenant={tenant}>{content}</TenantRuntimeProvider>
    </MantineProvider>
  )
}
