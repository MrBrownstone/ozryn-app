"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import Image from "next/image"
import { isAdminHost } from "@/lib/admin/control-plane"
import { createTenantMedplum } from "@/lib/medplum"
import type { TenantRuntimeConfig } from "@/lib/tenants/types"

interface TenantRuntimeResponse {
  currentTenant: TenantRuntimeConfig | null
  tenants: TenantRuntimeConfig[]
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/:80$|:443$/, "")
}

function hostMatchesTenant(host: string, tenant: TenantRuntimeConfig): boolean {
  const normalizedHost = normalizeHost(host)
  const withoutPort = normalizedHost.split(":")[0]

  if (tenant.domains.some((domain) => normalizeHost(domain) === normalizedHost)) {
    return true
  }

  return (
    withoutPort === `${tenant.slug}.localhost` ||
    withoutPort === `${tenant.slug}.ozryn.app`
  )
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [tenants, setTenants] = useState<TenantRuntimeConfig[]>([])
  const [selectedTenantSlug, setSelectedTenantSlug] = useState("")
  const [browserHost, setBrowserHost] = useState("")
  const [browserOrigin, setBrowserOrigin] = useState("")
  const [isLoadingTenants, setIsLoadingTenants] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const requestedTenantSlug = searchParams.get("tenant")?.trim().toLowerCase() ?? ""
  const selectedTenant =
    tenants.find((tenant) => tenant.slug === selectedTenantSlug) ?? null
  const adminControlPlane = browserHost ? isAdminHost(browserHost) : false
  const hostLockedTenant =
    browserHost && selectedTenant && hostMatchesTenant(browserHost, selectedTenant)
      ? selectedTenant
      : null
  const isWorkspaceLocked = Boolean(hostLockedTenant)
  const canSwitchWorkspace =
    Boolean(hostLockedTenant) &&
    normalizeHost(browserHost).includes(".localhost")

  useEffect(() => {
    setBrowserHost(window.location.host)
    setBrowserOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadTenants() {
      if (browserHost && isAdminHost(browserHost)) {
        setTenants([])
        setSelectedTenantSlug("")
        setIsLoadingTenants(false)
        return
      }

      setIsLoadingTenants(true)

      try {
        const query = requestedTenantSlug
          ? `?slug=${encodeURIComponent(requestedTenantSlug)}`
          : ""
        const response = await fetch(`/api/tenant-runtime${query}`, {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error("Could not load tenant configuration.")
        }

        const data = (await response.json()) as TenantRuntimeResponse
        if (cancelled) {
          return
        }

        setTenants(data.tenants)

        const preferredTenantSlug =
          data.currentTenant?.slug ?? requestedTenantSlug ?? data.tenants[0]?.slug ?? ""

        setSelectedTenantSlug((currentValue) =>
          currentValue &&
          data.tenants.some((tenant) => tenant.slug === currentValue)
            ? currentValue
            : preferredTenantSlug,
        )
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message ||
              "Could not load tenants. Add tenant mappings to data/tenants.local.json.",
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTenants(false)
        }
      }
    }

    loadTenants().catch(console.error)

    return () => {
      cancelled = true
    }
  }, [browserHost, requestedTenantSlug])

  if (adminControlPlane) {
    return (
      <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <Image src="ozryn.svg" alt="OZRYN Logo" width={200} height={200} />
            <p className="text-sm text-muted-foreground text-center">Operator Control Plane</p>
          </div>

          <Card className="p-6 md:p-8 border border-border/40 shadow-sm text-center space-y-4">
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">Admin Login</h1>
              <p className="text-sm text-muted-foreground">
                This host is reserved for platform operators. Tenant staff should sign
                in on their tenant host instead.
              </p>
            </div>
            <Link
              href="/admin/login"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Continue to Admin Sign In
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  const getTenantLoginUrl = (tenant: TenantRuntimeConfig): string => {
    if (!browserOrigin) {
      return `/login?tenant=${encodeURIComponent(tenant.slug)}`
    }

    const current = new URL(browserOrigin)
    const portSuffix = current.port ? `:${current.port}` : ""
    const localTenantHost =
      tenant.domains.find(
        (domain) => normalizeHost(domain) === `${tenant.slug}.localhost${portSuffix}`,
      ) ??
      tenant.domains.find((domain) => normalizeHost(domain).includes(".localhost")) ??
      tenant.canonicalDomain

    const targetHost = normalizeHost(browserHost).includes("localhost")
      ? localTenantHost
      : tenant.canonicalDomain

    return `${current.protocol}//${targetHost}/login`
  }

  const getWorkspaceSwitcherUrl = (): string => {
    if (!browserOrigin) {
      return "/login"
    }

    const current = new URL(browserOrigin)
    const portSuffix = current.port ? `:${current.port}` : ""
    return `${current.protocol}//localhost${portSuffix}/login`
  }

  const handleWorkspaceContinue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    if (!selectedTenant) {
      setError("Select a workspace to continue.")
      return
    }

    window.location.assign(getTenantLoginUrl(selectedTenant))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      if (!selectedTenant) {
        throw new Error("Select a tenant before signing in.")
      }

      const tenantResponse = await fetch("/api/tenant-select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug: selectedTenant.slug }),
      })

      if (!tenantResponse.ok) {
        const payload = await tenantResponse
          .json()
          .catch(() => ({ error: "Could not persist tenant context." }))
        throw new Error(payload.error || "Could not persist tenant context.")
      }

      const medplum = createTenantMedplum(selectedTenant)
      const res = await medplum.startLogin({
        email,
        password,
        scope: "openid offline_access",
      })

      // if we get a code, that means login succeeded
      if (res.code) {
        await medplum.processCode(res.code) // fetches token + stores it internally
        router.replace("/")
        router.refresh()
        return
      }

      // if no code came back, credentials or org setup is incomplete
      throw new Error("Login response did not include authorization code.")
    } catch (err: any) {
      console.error("Login error:", err)
      setError(err?.message || "Login failed. Check credentials or auth config.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Image src="ozryn.svg" alt="OZRYN Logo" width={200} height={200} />
          <p className="text-sm text-muted-foreground text-center">Health Operating System</p>
        </div>

        <Card className="p-6 md:p-8 border border-border/40 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-1">Sign In</h2>
            <p className="text-sm text-muted-foreground">
              {isWorkspaceLocked
                ? "Clinical access to precision health management"
                : "Choose a workspace first, then continue to its dedicated login URL"}
            </p>
          </div>

          <form onSubmit={isWorkspaceLocked ? handleSubmit : handleWorkspaceContinue} className="space-y-4">
            {error && (
              <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="tenant" className="text-sm font-medium text-foreground">Workspace</label>
              {isWorkspaceLocked && hostLockedTenant ? (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{hostLockedTenant.displayName}</p>
                      <p className="text-xs text-muted-foreground">{browserHost || hostLockedTenant.slug}</p>
                    </div>
                    <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      Host locked
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    id="tenant"
                    value={selectedTenantSlug}
                    onChange={(e) => {
                      setSelectedTenantSlug(e.target.value)
                      setError("")
                    }}
                    className="flex h-10 w-full rounded-md border border-border/60 bg-input px-3 py-2 text-sm outline-hidden transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading || isLoadingTenants || tenants.length === 0}
                  >
                    <option value="">
                      {isLoadingTenants
                        ? "Loading workspaces..."
                        : tenants.length > 0
                          ? "Select a workspace"
                          : "No workspaces configured"}
                    </option>
                    {tenants.map((tenant) => (
                      <option key={tenant.slug} value={tenant.slug}>
                        {tenant.displayName}
                      </option>
                    ))}
                  </select>
                  {selectedTenant ? (
                    <p className="text-xs text-muted-foreground">
                      Continue to <span className="font-medium">{getTenantLoginUrl(selectedTenant)}</span>
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {isWorkspaceLocked ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">Email Address</label>
                  <Input id="email" type="email" placeholder="doctor@hospital.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} className="h-10 bg-input border-border/60"
                    disabled={isLoading || isLoadingTenants} autoComplete="username" />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
                  <Input id="password" type="password" placeholder="••••••••" value={password}
                    onChange={(e) => setPassword(e.target.value)} className="h-10 bg-input border-border/60"
                    disabled={isLoading || isLoadingTenants} autoComplete="current-password" />
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                  disabled={isLoading || isLoadingTenants || !selectedTenant}
                >
                  {isLoading ? "Signing In..." : "Sign In"}
                </Button>
              </>
            ) : (
              <Button
                type="submit"
                className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                disabled={isLoadingTenants || !selectedTenant}
              >
                Continue to Workspace
              </Button>
            )}
          </form>

          <div className="mt-6 space-y-2 text-center text-sm">
            {isWorkspaceLocked ? (
              <>
                <Link href="#" className="block text-primary hover:text-primary/80 transition-colors">Forgot Password?</Link>
                <p className="text-muted-foreground">
                  Don't have access?{" "}
                  <Link href="#" className="text-primary hover:text-primary/80 transition-colors font-medium">Request Access</Link>
                </p>
                {canSwitchWorkspace ? (
                  <Link href={getWorkspaceSwitcherUrl()} className="block text-primary hover:text-primary/80 transition-colors">
                    Switch workspace
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">
                Choose a workspace to continue on its dedicated tenant login URL.
              </p>
            )}
          </div>
        </Card>

        <div className="mt-6 p-4 rounded-md bg-muted/30 border border-border/40">
          <p className="text-xs text-muted-foreground text-center">
            HIPAA-compliant access. All connections are encrypted. For clinical use only.
          </p>
          {!isLoadingTenants && tenants.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Add tenant mappings to <code>data/tenants.local.json</code> to enable multi-tenant login on one local app instance.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
