'use client'

import type React from 'react'
import { startTransition, useEffect, useState } from 'react'

import type { AdminLoginConfig } from '@/lib/admin/control-plane'
import { configureAdminMedplum } from '@/lib/admin/medplum'
import type {
  CreateTenantInput,
  CreateTenantResult,
  TenantBootstrapUserInput,
  TenantBootstrapUserRole,
  TenantDetail,
  TenantMembershipSummary,
  TenantOrganizationProfile,
  TenantRecord,
  TenantStatus,
  UpdateTenantInput,
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

type OrganizationProfileFormState = {
  legalName: string
  contactEmail: string
  contactPhone: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
  timezone: string
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

function emptyOrganizationProfile(): OrganizationProfileFormState {
  return {
    legalName: '',
    contactEmail: '',
    contactPhone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    timezone: '',
  }
}

function organizationProfileToFormState(
  profile: TenantOrganizationProfile | null | undefined,
): OrganizationProfileFormState {
  return {
    legalName: profile?.legalName ?? '',
    contactEmail: profile?.contactEmail ?? '',
    contactPhone: profile?.contactPhone ?? '',
    line1: profile?.address?.line1 ?? '',
    line2: profile?.address?.line2 ?? '',
    city: profile?.address?.city ?? '',
    state: profile?.address?.state ?? '',
    postalCode: profile?.address?.postalCode ?? '',
    country: profile?.address?.country ?? '',
    timezone: profile?.timezone ?? '',
  }
}

function buildOrganizationProfile(
  state: OrganizationProfileFormState,
): TenantOrganizationProfile {
  return {
    contactEmail: state.contactEmail,
    ...(state.legalName ? { legalName: state.legalName } : undefined),
    ...(state.contactPhone ? { contactPhone: state.contactPhone } : undefined),
    ...(state.line1 ||
    state.line2 ||
    state.city ||
    state.state ||
    state.postalCode ||
    state.country
      ? {
          address: {
            ...(state.line1 ? { line1: state.line1 } : undefined),
            ...(state.line2 ? { line2: state.line2 } : undefined),
            ...(state.city ? { city: state.city } : undefined),
            ...(state.state ? { state: state.state } : undefined),
            ...(state.postalCode ? { postalCode: state.postalCode } : undefined),
            ...(state.country ? { country: state.country } : undefined),
          },
        }
      : undefined),
    ...(state.timezone ? { timezone: state.timezone } : undefined),
  }
}

function hasBootstrapUserInput(user: BootstrapUserFormState): boolean {
  return Boolean(user.firstName || user.lastName || user.email)
}

function sortTenants(tenants: TenantRecord[]): TenantRecord[] {
  return [...tenants].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  )
}

function membershipLabel(membership: TenantMembershipSummary): string {
  return (
    membership.fullName || membership.email || membership.userName || membership.membershipId
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
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>(
    initialTenants[0]?.slug ?? '',
  )

  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [organizationProfile, setOrganizationProfile] =
    useState<OrganizationProfileFormState>(emptyOrganizationProfile())
  const [primaryAdmin, setPrimaryAdmin] = useState<BootstrapUserFormState>(
    emptyBootstrapUser('TenantAdmin'),
  )
  const [initialUsers, setInitialUsers] = useState<BootstrapUserFormState[]>([])
  const [result, setResult] = useState<CreateTenantResult | null>(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null)
  const [tenantEditorDisplayName, setTenantEditorDisplayName] = useState('')
  const [tenantEditorStatus, setTenantEditorStatus] = useState<TenantStatus>('active')
  const [tenantEditorProfile, setTenantEditorProfile] =
    useState<OrganizationProfileFormState>(emptyOrganizationProfile())
  const [memberships, setMemberships] = useState<TenantMembershipSummary[]>([])
  const [detailError, setDetailError] = useState('')
  const [isLoadingTenantWorkspace, setIsLoadingTenantWorkspace] = useState(false)
  const [isSavingTenant, setIsSavingTenant] = useState(false)
  const [savingMembershipId, setSavingMembershipId] = useState<string | null>(null)

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

  function updateOrganizationProfileField(
    key: keyof OrganizationProfileFormState,
    value: string,
  ): void {
    setOrganizationProfile((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updateTenantEditorProfileField(
    key: keyof OrganizationProfileFormState,
    value: string,
  ): void {
    setTenantEditorProfile((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updateMembership(
    membershipId: string,
    patch: Partial<TenantMembershipSummary>,
  ): void {
    setMemberships((currentMemberships) =>
      currentMemberships.map((membership) =>
        membership.membershipId === membershipId
          ? { ...membership, ...patch }
          : membership,
      ),
    )
  }

  useEffect(() => {
    let cancelled = false

    async function loadTenantWorkspace(): Promise<void> {
      if (!selectedTenantSlug) {
        setTenantDetail(null)
        setMemberships([])
        setDetailError('')
        return
      }

      setIsLoadingTenantWorkspace(true)
      setDetailError('')

      try {
        const [detailResponse, membershipResponse] = await Promise.all([
          fetch(`/api/admin/tenants/${encodeURIComponent(selectedTenantSlug)}`, {
            cache: 'no-store',
          }),
          fetch(`/api/admin/tenants/${encodeURIComponent(selectedTenantSlug)}/users`, {
            cache: 'no-store',
          }),
        ])

        if (!detailResponse.ok) {
          const body = await detailResponse
            .json()
            .catch(() => ({ error: 'Could not load tenant detail.' }))
          throw new Error(body.error || 'Could not load tenant detail.')
        }

        if (!membershipResponse.ok) {
          const body = await membershipResponse
            .json()
            .catch(() => ({ error: 'Could not load tenant memberships.' }))
          throw new Error(body.error || 'Could not load tenant memberships.')
        }

        const detail = (await detailResponse.json()) as TenantDetail
        const membershipPayload = (await membershipResponse.json()) as {
          memberships: TenantMembershipSummary[]
        }

        if (cancelled) {
          return
        }

        setTenantDetail(detail)
        setTenantEditorDisplayName(detail.tenant.displayName)
        setTenantEditorStatus(detail.tenant.status)
        setTenantEditorProfile(organizationProfileToFormState(detail.organizationProfile))
        setMemberships(membershipPayload.memberships)
      } catch (err) {
        if (!cancelled) {
          setDetailError(
            err instanceof Error ? err.message : 'Could not load tenant workspace.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTenantWorkspace(false)
        }
      }
    }

    void loadTenantWorkspace()

    return () => {
      cancelled = true
    }
  }, [selectedTenantSlug])

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
        organizationProfile: buildOrganizationProfile(organizationProfile),
        primaryAdmin: {
          firstName: primaryAdmin.firstName,
          lastName: primaryAdmin.lastName,
          email: primaryAdmin.email,
          password: primaryAdmin.password || undefined,
          sendEmail: primaryAdmin.sendEmail,
        },
        initialUsers: initialUsers
          .filter(hasBootstrapUserInput)
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
        setSelectedTenantSlug(nextResult.tenant.slug)
      })

      setSlug('')
      setDisplayName('')
      setOrganizationProfile(emptyOrganizationProfile())
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

  async function handleSaveTenant(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!tenantDetail) {
      return
    }

    setIsSavingTenant(true)
    setDetailError('')

    try {
      const payload: UpdateTenantInput = {
        displayName: tenantEditorDisplayName,
        status: tenantEditorStatus,
        ...(tenantDetail.organizationProfile
          ? {
              organizationProfile: buildOrganizationProfile(tenantEditorProfile),
            }
          : undefined),
      }

      const response = await fetch(
        `/api/admin/tenants/${encodeURIComponent(tenantDetail.tenant.slug)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: 'Could not update tenant.' }))
        throw new Error(body.error || 'Could not update tenant.')
      }

      const updatedDetail = (await response.json()) as TenantDetail
      setTenantDetail(updatedDetail)
      setTenantEditorDisplayName(updatedDetail.tenant.displayName)
      setTenantEditorStatus(updatedDetail.tenant.status)
      setTenantEditorProfile(
        organizationProfileToFormState(updatedDetail.organizationProfile),
      )
      setTenants((currentTenants) =>
        sortTenants(
          currentTenants.map((tenant) =>
            tenant.slug === updatedDetail.tenant.slug ? updatedDetail.tenant : tenant,
          ),
        ),
      )
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not update tenant.')
    } finally {
      setIsSavingTenant(false)
    }
  }

  async function handleSaveMembership(
    membership: TenantMembershipSummary,
  ): Promise<void> {
    if (!tenantDetail) {
      return
    }

    setSavingMembershipId(membership.membershipId)
    setDetailError('')

    try {
      const response = await fetch(
        `/api/admin/tenants/${encodeURIComponent(
          tenantDetail.tenant.slug,
        )}/users/${encodeURIComponent(membership.membershipId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: membership.role,
            active: membership.active,
          }),
        },
      )

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: 'Could not update membership.' }))
        throw new Error(body.error || 'Could not update membership.')
      }

      const payload = (await response.json()) as {
        membership: TenantMembershipSummary
      }
      updateMembership(membership.membershipId, payload.membership)
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : 'Could not update membership.',
      )
    } finally {
      setSavingMembershipId(null)
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

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,460px)]">
        <Card className="border-border/60 p-6">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Create Tenant</h2>
            <p className="text-sm text-muted-foreground">
              Provision a Medplum project, clinic organization profile, tenant client,
              and initial human memberships from the OZRYN control plane.
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

            <div className="rounded-lg border border-border/60 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Clinic Profile</h3>
                <p className="text-xs text-muted-foreground">
                  Operational organization data is stored on the tenant&apos;s Medplum
                  Organization.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  value={organizationProfile.legalName}
                  onChange={(event) =>
                    updateOrganizationProfileField('legalName', event.target.value)
                  }
                  placeholder="Legal name"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.contactEmail}
                  onChange={(event) =>
                    updateOrganizationProfileField('contactEmail', event.target.value)
                  }
                  placeholder="Contact email"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.contactPhone}
                  onChange={(event) =>
                    updateOrganizationProfileField('contactPhone', event.target.value)
                  }
                  placeholder="Contact phone"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.timezone}
                  onChange={(event) =>
                    updateOrganizationProfileField('timezone', event.target.value)
                  }
                  placeholder="Timezone (e.g. America/New_York)"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.line1}
                  onChange={(event) =>
                    updateOrganizationProfileField('line1', event.target.value)
                  }
                  placeholder="Address line 1"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.line2}
                  onChange={(event) =>
                    updateOrganizationProfileField('line2', event.target.value)
                  }
                  placeholder="Address line 2"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.city}
                  onChange={(event) =>
                    updateOrganizationProfileField('city', event.target.value)
                  }
                  placeholder="City"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.state}
                  onChange={(event) =>
                    updateOrganizationProfileField('state', event.target.value)
                  }
                  placeholder="State / Province"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.postalCode}
                  onChange={(event) =>
                    updateOrganizationProfileField('postalCode', event.target.value)
                  }
                  placeholder="Postal code"
                  disabled={isSubmitting}
                />
                <Input
                  value={organizationProfile.country}
                  onChange={(event) =>
                    updateOrganizationProfileField('country', event.target.value)
                  }
                  placeholder="Country"
                  disabled={isSubmitting}
                />
              </div>
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
                  placeholder="admin@clinic.example"
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Existing Tenants</h2>
              {isLoadingTenantWorkspace ? (
                <span className="text-xs text-muted-foreground">Loading…</span>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {tenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tenants provisioned yet.
                </p>
              ) : null}

              {tenants.map((tenant) => (
                <button
                  key={tenant.slug}
                  type="button"
                  className={`w-full rounded-md border p-4 text-left transition-colors ${
                    tenant.slug === selectedTenantSlug
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/60 hover:border-primary/20 hover:bg-muted/20'
                  }`}
                  onClick={() => setSelectedTenantSlug(tenant.slug)}
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
                    <p>Status: {tenant.status}</p>
                    <p>Project: {tenant.medplumProjectId}</p>
                    <p>Client: {tenant.medplumClientId}</p>
                    {tenant.lastProvisioningError ? (
                      <p>Last issue: {tenant.lastProvisioningError}</p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {detailError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {detailError}
            </div>
          ) : null}

          {tenantDetail ? (
            <Card className="border-border/60 p-6">
              <div className="mb-4 space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Tenant Detail</h2>
                <p className="text-sm text-muted-foreground">
                  Operator support tools can edit tenant metadata, tenant status, and
                  existing memberships. Day-to-day invites stay with the tenant admin.
                </p>
              </div>

              <form onSubmit={handleSaveTenant} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Display Name
                    </label>
                    <Input
                      value={tenantEditorDisplayName}
                      onChange={(event) => setTenantEditorDisplayName(event.target.value)}
                      disabled={isSavingTenant}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Status</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={tenantEditorStatus}
                      onChange={(event) =>
                        setTenantEditorStatus(event.target.value as TenantStatus)
                      }
                      disabled={isSavingTenant}
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>

                {tenantDetail.organizationProfile ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      value={tenantEditorProfile.legalName}
                      onChange={(event) =>
                        updateTenantEditorProfileField('legalName', event.target.value)
                      }
                      placeholder="Legal name"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.contactEmail}
                      onChange={(event) =>
                        updateTenantEditorProfileField('contactEmail', event.target.value)
                      }
                      placeholder="Contact email"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.contactPhone}
                      onChange={(event) =>
                        updateTenantEditorProfileField('contactPhone', event.target.value)
                      }
                      placeholder="Contact phone"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.timezone}
                      onChange={(event) =>
                        updateTenantEditorProfileField('timezone', event.target.value)
                      }
                      placeholder="Timezone"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.line1}
                      onChange={(event) =>
                        updateTenantEditorProfileField('line1', event.target.value)
                      }
                      placeholder="Address line 1"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.line2}
                      onChange={(event) =>
                        updateTenantEditorProfileField('line2', event.target.value)
                      }
                      placeholder="Address line 2"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.city}
                      onChange={(event) =>
                        updateTenantEditorProfileField('city', event.target.value)
                      }
                      placeholder="City"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.state}
                      onChange={(event) =>
                        updateTenantEditorProfileField('state', event.target.value)
                      }
                      placeholder="State / Province"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.postalCode}
                      onChange={(event) =>
                        updateTenantEditorProfileField('postalCode', event.target.value)
                      }
                      placeholder="Postal code"
                      disabled={isSavingTenant}
                    />
                    <Input
                      value={tenantEditorProfile.country}
                      onChange={(event) =>
                        updateTenantEditorProfileField('country', event.target.value)
                      }
                      placeholder="Country"
                      disabled={isSavingTenant}
                    />
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This tenant does not have a Medplum Organization yet, so only the OZRYN
                    display name and tenant status can be edited until bootstrap is repaired.
                  </div>
                )}

                <Button type="submit" disabled={isSavingTenant}>
                  {isSavingTenant ? 'Saving...' : 'Save Tenant'}
                </Button>
              </form>
            </Card>
          ) : null}

          {tenantDetail ? (
            <Card className="border-border/60 p-6">
              <div className="mb-4 space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Membership Support</h2>
                <p className="text-sm text-muted-foreground">
                  Review and adjust existing tenant memberships without creating new users
                  from the platform operator surface.
                </p>
              </div>

              <div className="space-y-3">
                {memberships.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No practitioner memberships found for this tenant.
                  </p>
                ) : null}

                {memberships.map((membership) => (
                  <div
                    key={membership.membershipId}
                    className="rounded-md border border-border/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {membershipLabel(membership)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {membership.email ?? membership.userName ?? 'No email'}
                        </p>
                      </div>
                      <span className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {membership.active ? 'active' : 'inactive'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={membership.role}
                        onChange={(event) =>
                          updateMembership(membership.membershipId, {
                            role: event.target.value as TenantBootstrapUserRole,
                          })
                        }
                        disabled={savingMembershipId === membership.membershipId}
                      >
                        <option value="Staff">Staff</option>
                        <option value="TenantAdmin">Tenant Admin</option>
                      </select>

                      <label className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={membership.active}
                          onChange={(event) =>
                            updateMembership(membership.membershipId, {
                              active: event.target.checked,
                            })
                          }
                          disabled={savingMembershipId === membership.membershipId}
                        />
                        Active
                      </label>

                      <Button
                        type="button"
                        variant="outline"
                        disabled={savingMembershipId === membership.membershipId}
                        onClick={() => {
                          void handleSaveMembership(membership)
                        }}
                      >
                        {savingMembershipId === membership.membershipId
                          ? 'Saving...'
                          : 'Save'}
                      </Button>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>Membership: {membership.membershipId}</p>
                      <p>Policy: {membership.accessPolicyName ?? 'Unknown'}</p>
                      {membership.practitionerRoleId ? (
                        <p>PractitionerRole: {membership.practitionerRoleId}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

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
