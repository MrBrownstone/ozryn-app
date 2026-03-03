'use client'

import { MedplumProvider } from '@medplum/react'
import type { ReactNode } from 'react'
import { medplum } from '@/lib/medplum'
import { MantineProvider, createTheme } from '@mantine/core'

const theme = createTheme({
  fontFamily: 'var(--font-sans)',
})
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme}>
      <MedplumProvider medplum={medplum}>
        {children}
      </MedplumProvider>
    </MantineProvider>
  )
}
