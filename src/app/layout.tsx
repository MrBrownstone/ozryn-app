import type React from "react"
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import Providers from "./providers"
import {
  TENANT_COOKIE_NAME,
  resolveTenantRuntimeForRequest,
} from "@/lib/tenants/runtime.server"

const geist = Geist({ subsets: ["latin"] })
const geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "OZRYN - Health Operating System",
  description: "Clinical command center for precision health management",
  generator: "v0.app",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const headerStore = await headers()
  const cookieStore = await cookies()
  const tenant = await resolveTenantRuntimeForRequest({
    host: headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
    tenantSlugOverride: cookieStore.get(TENANT_COOKIE_NAME)?.value ?? null,
  })

  return (
    <html lang="en">
      <body className={`${geist.className} font-sans antialiased`}>
        <Providers tenant={tenant}>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  )
}
