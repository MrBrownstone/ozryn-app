'use client'

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

import type { TenantRuntimeConfig } from '@/lib/tenants/types'

const TenantRuntimeContext = createContext<TenantRuntimeConfig | null>(null)

export function TenantRuntimeProvider({
  tenant,
  children,
}: {
  tenant: TenantRuntimeConfig | null
  children: ReactNode
}) {
  return (
    <TenantRuntimeContext.Provider value={tenant}>
      {children}
    </TenantRuntimeContext.Provider>
  )
}

export function useTenantRuntime(): TenantRuntimeConfig | null {
  return useContext(TenantRuntimeContext)
}
