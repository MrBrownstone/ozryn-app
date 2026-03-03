// lib/medplum.ts
import { MedplumClient } from '@medplum/core'

export const medplum = new MedplumClient({
  baseUrl: process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL,
  clientId: process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID!,
  onUnauthenticated: () => {
    // Optional: central place to bounce unauthenticated users
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
  },
})
