'use client'

import type React from 'react'
import { startTransition, useState } from 'react'

import type { AdminLoginConfig } from '@/lib/admin/control-plane'
import { configureAdminMedplum } from '@/lib/admin/medplum'
import type {
  CreateTenantInput,
  CreateTenantResult,
  TenantBootstrapUserInput,
  TenantBootstrapUserRole,
  TenantRecord,
} from '@/lib/tenants/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type BootstrapUserFormState = {
  firstName: string
  lastName: string
  email: string
  role: TenantBootstrapUserRole
  password: string
  sendEmail: boolean
}

function emptyBootstrapUser(role: TenantBootstrapUserRole = 'Staff'): BootstrapUserFormState {
  return {
    firstName: '',
    lastName: '',
    email: '',
    role,
    password: '',
    sendEmail: false,
  }
}

function sortTenants(tenants: TenantRecord[]): TenantRecord[] {
  return [...tenants].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  )
}

export function AdminDashboard({
  adminEmail,
  authConfig,
  initialTenants,
}: {
  adminEmail: string
  authConfig: AdminLoginConfig | null
  initialTenants: TenantRecord[]
}) {
  const [tenants, setTenants] = useState<TenantRecord[]>(sortTenants(initialTenants))
  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [customDomains, setCustomDomains] = useState('')
  const [primaryAdmin, setPrimaryAdmin] = useState<BootstrapUserFormState>(
    emptyBootstrapUser('TenantAdmin'),
  )
  const [initialUsers, setInitialUsers] = useState<BootstrapUserFormState[]>([])
  const [result, setResult] = useState<CreateTenantResult | null>(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  function updateInitialUser(
    index: number,
    patch: Partial<BootstrapUserFormState>,
  ): void {
    setInitialUsers((currentUsers) =>
      currentUsers.map((user, currentIndex) =>
        currentIndex === index ? { ...user, ...patch } : user,
      ),
    )
  }

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true)
    try {
      if (authConfig) {
        const medplum = configureAdminMedplum(authConfig)
        try {
          await medplum.signOut()
        } catch {
          medplum.clear()
        }
      }

      await fetch('/api/admin/session', {
        method: 'DELETE',
      })
      window.location.assign('/admin/login')
    } finally {
      setIsLoggingOut(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    setResult(null)
    setIsSubmitting(true)

    try {
      const payload: CreateTenantInput = {
        slug,
        displayName,
        customDomains: customDomains
          .split(',')
          .map((domain) => domain.trim())
          .filter(Boolean),
        primaryAdmin: {
          firstName: primaryAdmin.firstName,
          lastName: primaryAdmin.lastName,
          email: primaryAdmin.email,
          password: primaryAdmin.password || undefined,
          sendEmail: primaryAdmin.sendEmail,
        },
        initialUsers: initialUsers
          .filter((user) => user.firstName || user.lastName || user.email)
          .map(
            (user): TenantBootstrapUserInput => ({
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              role: user.role,
              password: user.password || undefined,
              sendEmail: user.sendEmail,
            }),
          ),
      }

      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: 'Tenant provisioning failed.' }))
        throw new Error(body.error || 'Tenant provisioning failed.')
      }

      const nextResult = (await response.json()) as CreateTenantResult
      startTransition(() => {
        setResult(nextResult)
        setTenants((currentTenants) =>
          sortTenants([
            ...currentTenants.filter(
              (tenant) => tenant.slug !== nextResult.tenant.slug,
            ),
            nextResult.tenant,
          ]),
        )
      })

      setSlug('')
      setDisplayName('')
      setCustomDomains('')
      setPrimaryAdmin(emptyBootstrapUser('TenantAdmin'))
      setInitialUsers([])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Tenant provisioning failed.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm text-muted-foreground">OZRYN Operator Control Plane</p>
            <h1 className="text-2xl font-semibold text-foreground">Tenant Provisioning</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-sm text-muted-foreground">
              {adminEmail}
            </span>
            <Button
              variant="outline"
              onClick={() => {
                void handleLogout()
              }}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
        <Card className="border-border/60 p-6">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Create Tenant</h2>
            <p className="text-sm text-muted-foreground">
              Provision a Medplum project, root organization, tenant client, and
              initial human memberships from the OZRYN control plane.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="tenant-slug">
                  Tenant Slug
                </label>
                <Input
                  id="tenant-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="princeton"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="tenant-display-name"
                >
                  Display Name
                </label>
                <Input
                  id="tenant-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Princeton Plainsboro"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="tenant-custom-domains"
              >
                Custom Domains
              </label>
              <Input
                id="tenant-custom-domains"
                value={customDomains}
                onChange={(event) => setCustomDomains(event.target.value)}
                placeholder="ehr.princetonhospital.org, portal.princetonhospital.org"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Optional, comma separated. Domain automation stays manual for now.
              </p>
            </div>

            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Primary Tenant Admin</h3>
                <p className="text-xs text-muted-foreground">
                  Required. This user becomes the first tenant admin for the new
                  project.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  value={primaryAdmin.firstName}
                  onChange={(event) =>
                    setPrimaryAdmin((current) => ({
                      ...current,
                      firstName: event.target.value,
                    }))
                  }
                  placeholder="First name"
                  disabled={isSubmitting}
                />
                <Input
                  value={primaryAdmin.lastName}
                  onChange={(event) =>
                    setPrimaryAdmin((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
                  }
                  placeholder="Last name"
                  disabled={isSubmitting}
                />
                <Input
                  value={primaryAdmin.email}
                  onChange={(event) =>
                    setPrimaryAdmin((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="house@princeton.local"
                  disabled={isSubmitting}
                />
                <Input
                  type="password"
                  value={primaryAdmin.password}
                  onChange={(event) =>
                    setPrimaryAdmin((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder="Optional local-dev password"
                  disabled={isSubmitting}
                />
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={primaryAdmin.sendEmail}
                  onChange={(event) =>
                    setPrimaryAdmin((current) => ({
                      ...current,
                      sendEmail: event.target.checked,
                    }))
                  }
                  disabled={isSubmitting}
                />
                Send invite email
              </label>
            </div>

            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Initial Users</h3>
                  <p className="text-xs text-muted-foreground">
                    Optional. Add more project-scoped staff or tenant admins during
                    bootstrap.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setInitialUsers((currentUsers) => [
                      ...currentUsers,
                      emptyBootstrapUser(),
                    ])
                  }
                  disabled={isSubmitting}
                >
                  Add User
                </Button>
              </div>

              <div className="space-y-4">
                {initialUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No additional users yet.
                  </p>
                ) : null}

                {initialUsers.map((user, index) => (
                  <div
                    key={`${index}-${user.email}`}
                    className="rounded-md border border-border/60 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">
                        User {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto px-2 py-1 text-sm text-muted-foreground"
                        onClick={() =>
                          setInitialUsers((currentUsers) =>
                            currentUsers.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          )
                        }
                        disabled={isSubmitting}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        value={user.firstName}
                        onChange={(event) =>
                          updateInitialUser(index, { firstName: event.target.value })
                        }
                        placeholder="First name"
                        disabled={isSubmitting}
                      />
                      <Input
                        value={user.lastName}
                        onChange={(event) =>
                          updateInitialUser(index, { lastName: event.target.value })
                        }
                        placeholder="Last name"
                        disabled={isSubmitting}
                      />
                      <Input
                        value={user.email}
                        onChange={(event) =>
                          updateInitialUser(index, { email: event.target.value })
                        }
                        placeholder="clinician@example.com"
                        disabled={isSubmitting}
                      />
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={user.role}
                        onChange={(event) =>
                          updateInitialUser(index, {
                            role: event.target.value as TenantBootstrapUserRole,
                          })
                        }
                        disabled={isSubmitting}
                      >
                        <option value="Staff">Staff</option>
                        <option value="TenantAdmin">Tenant Admin</option>
                      </select>
                      <Input
                        type="password"
                        value={user.password}
                        onChange={(event) =>
                          updateInitialUser(index, { password: event.target.value })
                        }
                        placeholder="Optional local-dev password"
                        disabled={isSubmitting}
                      />
                    </div>

                    <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={user.sendEmail}
                        onChange={(event) =>
                          updateInitialUser(index, { sendEmail: event.target.checked })
                        }
                        disabled={isSubmitting}
                      />
                      Send invite email
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Provisioning...' : 'Create Tenant'}
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60 p-6">
            <h2 className="text-lg font-semibold text-foreground">Existing Tenants</h2>
            <div className="mt-4 space-y-3">
              {tenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tenants provisioned yet.
                </p>
              ) : null}

              {tenants.map((tenant) => (
                <div
                  key={tenant.slug}
                  className="rounded-md border border-border/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{tenant.displayName}</p>
                      <p className="text-sm text-muted-foreground">{tenant.slug}</p>
                    </div>
                    <span className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {tenant.bootstrapStatus}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>Project: {tenant.medplumProjectId}</p>
                    <p>Client: {tenant.medplumClientId}</p>
                    <p>Domains: {tenant.domains.join(', ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {result ? (
            <Card className="border-border/60 p-6">
              <h2 className="text-lg font-semibold text-foreground">Last Provisioning Result</h2>
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-foreground">
                  Created <span className="font-medium">{result.tenant.displayName}</span> as
                  project <span className="font-medium">{result.createdProjectId}</span>.
                </p>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Invited users</p>
                  {result.invitedUsers.map((user) => (
                    <div
                      key={`${user.email}-${user.role}`}
                      className="rounded-md border border-border/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-foreground">{user.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {user.role} · {user.status}
                        </span>
                      </div>
                      {user.note ? (
                        <p className="mt-1 text-xs text-muted-foreground">{user.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {result.manualSteps.length > 0 ? (
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">Manual follow-up</p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {result.manualSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
