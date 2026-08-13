'use client'

import type React from 'react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'

import type { AdminLoginConfig } from '@/lib/admin/control-plane'
import { configureAdminMedplum } from '@/lib/admin/medplum'
import type {
  CreateTenantInput,
  CreateTenantResult,
  TenantBootstrapUserInput,
  TenantBootstrapUserRole,
  TenantDetail,
  TenantMembershipDirectoryEntry,
  TenantMembershipSummary,
  TenantOrganizationProfile,
  TenantRecord,
  TenantStatus,
  UpdateTenantInput,
} from '@/lib/tenants/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type AdminView = 'overview' | 'tenants' | 'members' | 'create' | 'detail'
type TenantStatusFilter = 'all' | TenantStatus

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

function emptyBootstrapUser(
  role: TenantBootstrapUserRole = 'Staff',
): BootstrapUserFormState {
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

function membershipLabel(membership: TenantMembershipSummary): string {
  return (
    membership.fullName ||
    membership.email ||
    membership.userName ||
    membership.membershipId
  )
}

function getInitials(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  return localPart.slice(0, 2).toUpperCase() || 'OP'
}

function FormField({
  id,
  label,
  required = false,
  children,
}: {
  id: string
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </label>
      {children}
    </div>
  )
}

function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return status === 'active' ? (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-600">
      Disabled
    </Badge>
  )
}

function BootstrapStatusBadge({
  bootstrapStatus,
}: Pick<TenantRecord, 'bootstrapStatus'>) {
  return bootstrapStatus === 'ready' ? (
    <Badge
      variant="outline"
      className="border-cyan-200 bg-cyan-50 text-cyan-700"
    >
      Ready
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-amber-800"
    >
      Needs attention
    </Badge>
  )
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border/70 py-4 last:border-0">
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value || 'Not set'}</dd>
    </div>
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
  const [view, setView] = useState<AdminView>('overview')
  const [tenants, setTenants] = useState<TenantRecord[]>(() =>
    sortTenants(initialTenants),
  )
  const [selectedTenantSlug, setSelectedTenantSlug] = useState('')
  const [tenantSearch, setTenantSearch] = useState('')
  const [tenantStatusFilter, setTenantStatusFilter] =
    useState<TenantStatusFilter>('all')
  const [memberSearch, setMemberSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [organizationProfile, setOrganizationProfile] =
    useState<OrganizationProfileFormState>(emptyOrganizationProfile())
  const [primaryAdmin, setPrimaryAdmin] = useState<BootstrapUserFormState>(
    emptyBootstrapUser('TenantAdmin'),
  )
  const [initialUsers, setInitialUsers] = useState<BootstrapUserFormState[]>([])
  const [createResult, setCreateResult] = useState<CreateTenantResult | null>(null)
  const [createError, setCreateError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null)
  const [memberships, setMemberships] = useState<TenantMembershipSummary[]>([])
  const [tenantEditorDisplayName, setTenantEditorDisplayName] = useState('')
  const [tenantEditorProfile, setTenantEditorProfile] =
    useState<OrganizationProfileFormState>(emptyOrganizationProfile())
  const [detailError, setDetailError] = useState('')
  const [isLoadingTenantWorkspace, setIsLoadingTenantWorkspace] = useState(false)
  const [isSavingTenant, setIsSavingTenant] = useState(false)
  const [savingMembershipId, setSavingMembershipId] = useState<string | null>(null)
  const [directoryMemberships, setDirectoryMemberships] = useState<
    TenantMembershipDirectoryEntry[]
  >([])
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [isChangingTenantStatus, setIsChangingTenantStatus] = useState(false)

  const activeTenants = tenants.filter((tenant) => tenant.status === 'active').length
  const disabledTenants = tenants.length - activeTenants
  const tenantsNeedingAttention = tenants.filter(
    (tenant) => tenant.bootstrapStatus === 'pending-manual',
  )

  const recentTenants = useMemo(
    () =>
      [...tenants]
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        )
        .slice(0, 5),
    [tenants],
  )

  const filteredTenants = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase()

    return tenants.filter((tenant) => {
      const matchesStatus =
        tenantStatusFilter === 'all' || tenant.status === tenantStatusFilter
      const matchesQuery =
        !query ||
        tenant.displayName.toLowerCase().includes(query) ||
        tenant.slug.toLowerCase().includes(query) ||
        tenant.medplumProjectId.toLowerCase().includes(query)

      return matchesStatus && matchesQuery
    })
  }, [tenantSearch, tenantStatusFilter, tenants])

  const filteredDirectoryMemberships = useMemo(() => {
    const query = memberSearch.trim().toLowerCase()
    if (!query) {
      return directoryMemberships
    }

    return directoryMemberships.filter((membership) =>
      [
        membership.fullName,
        membership.email,
        membership.userName,
        membership.tenantDisplayName,
        membership.tenantSlug,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    )
  }, [directoryMemberships, memberSearch])

  const createFormDirty = Boolean(
    slug ||
      displayName ||
      Object.values(organizationProfile).some(Boolean) ||
      primaryAdmin.firstName ||
      primaryAdmin.lastName ||
      primaryAdmin.email ||
      primaryAdmin.password ||
      primaryAdmin.sendEmail ||
      initialUsers.length,
  )

  const selectedTenant = tenants.find(
    (tenant) => tenant.slug === selectedTenantSlug,
  )

  const pageTitle =
    view === 'overview'
      ? 'Overview'
      : view === 'tenants'
        ? 'Tenants'
        : view === 'members'
          ? 'Members'
        : view === 'create'
          ? 'Create tenant'
          : selectedTenant?.displayName || 'Tenant detail'

  const pageDescription =
    view === 'overview'
      ? 'Platform operations and tenant health'
      : view === 'tenants'
        ? 'Manage tenant lifecycle and Medplum bindings'
        : view === 'members'
          ? 'Cross-tenant membership support and access review'
        : view === 'create'
          ? 'Provision a new isolated Medplum project'
          : selectedTenant?.slug || ''

  function writeAdminUrl(nextView: AdminView, tenantSlug?: string): void {
    const url = new URL(window.location.href)
    url.search = ''

    if (nextView === 'detail' && tenantSlug) {
      url.searchParams.set('tenant', tenantSlug)
    } else if (nextView !== 'overview' && nextView !== 'detail') {
      url.searchParams.set('view', nextView)
    }

    window.history.pushState({}, '', url)
  }

  function confirmCreateFormDiscard(): boolean {
    return !(
      view === 'create' &&
      createFormDirty &&
      !window.confirm('Discard the unsaved tenant?')
    )
  }

  function navigate(nextView: AdminView): void {
    if (!confirmCreateFormDiscard()) {
      return
    }

    setNotice('')
    setDetailError('')
    writeAdminUrl(nextView)
    setView(nextView)
  }

  function openTenant(tenantSlug: string): void {
    if (!confirmCreateFormDiscard()) {
      return
    }

    setSelectedTenantSlug(tenantSlug)
    setNotice('')
    setDetailError('')
    writeAdminUrl('detail', tenantSlug)
    setView('detail')
  }

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
    setOrganizationProfile((current) => ({ ...current, [key]: value }))
  }

  function updateTenantEditorProfileField(
    key: keyof OrganizationProfileFormState,
    value: string,
  ): void {
    setTenantEditorProfile((current) => ({ ...current, [key]: value }))
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

  function updateDirectoryMembership(
    membershipId: string,
    patch: Partial<TenantMembershipSummary>,
  ): void {
    setDirectoryMemberships((currentMemberships) =>
      currentMemberships.map((membership) =>
        membership.membershipId === membershipId
          ? { ...membership, ...patch }
          : membership,
      ),
    )
  }

  useEffect(() => {
    function syncViewFromUrl(): void {
      const params = new URLSearchParams(window.location.search)
      const tenantSlug = params.get('tenant')
      const requestedView = params.get('view')

      if (tenantSlug) {
        setSelectedTenantSlug(tenantSlug)
        setView('detail')
        return
      }

      if (
        requestedView === 'tenants' ||
        requestedView === 'members' ||
        requestedView === 'create'
      ) {
        setView(requestedView)
        return
      }

      setView('overview')
    }

    syncViewFromUrl()
    window.addEventListener('popstate', syncViewFromUrl)
    return () => window.removeEventListener('popstate', syncViewFromUrl)
  }, [])

  useEffect(() => {
    if (view !== 'create' || !createFormDirty) {
      return
    }

    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [createFormDirty, view])

  useEffect(() => {
    if (view !== 'detail' || !selectedTenantSlug) {
      return
    }

    let cancelled = false

    async function loadTenantWorkspace(): Promise<void> {
      setIsLoadingTenantWorkspace(true)
      setDetailError('')
      setTenantDetail(null)
      setMemberships([])

      try {
        const [detailResponse, membershipResponse] = await Promise.all([
          fetch(`/api/admin/tenants/${encodeURIComponent(selectedTenantSlug)}`, {
            cache: 'no-store',
          }),
          fetch(
            `/api/admin/tenants/${encodeURIComponent(selectedTenantSlug)}/users`,
            { cache: 'no-store' },
          ),
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
        setTenantEditorProfile(
          organizationProfileToFormState(detail.organizationProfile),
        )
        setMemberships(membershipPayload.memberships)
      } catch (error) {
        if (!cancelled) {
          setDetailError(
            error instanceof Error
              ? error.message
              : 'Could not load tenant workspace.',
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
  }, [selectedTenantSlug, view])

  useEffect(() => {
    if (view !== 'members') {
      return
    }

    let cancelled = false

    async function loadMembershipDirectory(): Promise<void> {
      setIsLoadingDirectory(true)
      setDirectoryError('')

      try {
        const response = await fetch('/api/admin/memberships', {
          cache: 'no-store',
        })

        if (!response.ok) {
          const body = await response
            .json()
            .catch(() => ({ error: 'Could not load the membership directory.' }))
          throw new Error(body.error || 'Could not load the membership directory.')
        }

        const payload = (await response.json()) as {
          memberships: TenantMembershipDirectoryEntry[]
          failedTenants: string[]
        }

        if (cancelled) {
          return
        }

        setDirectoryMemberships(payload.memberships)
        if (payload.failedTenants.length > 0) {
          setDirectoryError(
            `Could not load memberships for: ${payload.failedTenants.join(', ')}.`,
          )
        }
      } catch (error) {
        if (!cancelled) {
          setDirectoryError(
            error instanceof Error
              ? error.message
              : 'Could not load the membership directory.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDirectory(false)
        }
      }
    }

    void loadMembershipDirectory()

    return () => {
      cancelled = true
    }
  }, [view])

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

      await fetch('/api/admin/session', { method: 'DELETE' })
      window.location.assign('/admin/login')
    } finally {
      setIsLoggingOut(false)
    }
  }

  async function handleCreateTenant(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    setCreateError('')
    setCreateResult(null)
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: 'Tenant provisioning failed.' }))
        throw new Error(body.error || 'Tenant provisioning failed.')
      }

      const result = (await response.json()) as CreateTenantResult
      setCreateResult(result)
      startTransition(() => {
        setTenants((currentTenants) =>
          sortTenants([
            ...currentTenants.filter((tenant) => tenant.slug !== result.tenant.slug),
            result.tenant,
          ]),
        )
        setSelectedTenantSlug(result.tenant.slug)
        setNotice(`${result.tenant.displayName} was created successfully.`)
        writeAdminUrl('detail', result.tenant.slug)
        setView('detail')
      })

      setSlug('')
      setDisplayName('')
      setOrganizationProfile(emptyOrganizationProfile())
      setPrimaryAdmin(emptyBootstrapUser('TenantAdmin'))
      setInitialUsers([])
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Tenant provisioning failed.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSaveTenant(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    if (!tenantDetail) {
      return
    }

    setIsSavingTenant(true)
    setDetailError('')

    try {
      const payload: UpdateTenantInput = {
        displayName: tenantEditorDisplayName,
        ...(tenantDetail.organizationProfile
          ? { organizationProfile: buildOrganizationProfile(tenantEditorProfile) }
          : undefined),
      }

      const response = await fetch(
        `/api/admin/tenants/${encodeURIComponent(tenantDetail.tenant.slug)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
      setEditDialogOpen(false)
      setNotice('Tenant details were updated.')
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : 'Could not update tenant.',
      )
    } finally {
      setIsSavingTenant(false)
    }
  }

  async function handleSaveMembership(
    membership: TenantMembershipSummary,
    tenantSlug = tenantDetail?.tenant.slug,
  ): Promise<void> {
    if (!tenantSlug) {
      return
    }

    setSavingMembershipId(membership.membershipId)
    setDetailError('')

    try {
      const response = await fetch(
        `/api/admin/tenants/${encodeURIComponent(tenantSlug)}/users/${encodeURIComponent(
          membership.membershipId,
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
      updateDirectoryMembership(membership.membershipId, payload.membership)
      setNotice(`${membershipLabel(payload.membership)} was updated.`)
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : 'Could not update membership.',
      )
    } finally {
      setSavingMembershipId(null)
    }
  }

  async function changeTenantStatus(status: TenantStatus): Promise<void> {
    if (!tenantDetail) {
      return
    }

    setIsChangingTenantStatus(true)
    setDetailError('')

    try {
      const response = await fetch(
        `/api/admin/tenants/${encodeURIComponent(tenantDetail.tenant.slug)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      )

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: 'Could not update tenant status.' }))
        throw new Error(body.error || 'Could not update tenant status.')
      }

      const updatedDetail = (await response.json()) as TenantDetail
      setTenantDetail(updatedDetail)
      setTenants((currentTenants) =>
        sortTenants(
          currentTenants.map((tenant) =>
            tenant.slug === updatedDetail.tenant.slug ? updatedDetail.tenant : tenant,
          ),
        ),
      )
      setStatusDialogOpen(false)
      setNotice(
        status === 'active'
          ? `${updatedDetail.tenant.displayName} was reactivated.`
          : `${updatedDetail.tenant.displayName} was deactivated.`,
      )
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : 'Could not update tenant status.',
      )
    } finally {
      setIsChangingTenantStatus(false)
    }
  }

  function renderTenantActions(tenant: TenantRecord): React.ReactNode {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => openTenant(tenant.slug)}
            aria-label={`Open ${tenant.displayName}`}
          >
            <ChevronRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open tenant</TooltipContent>
      </Tooltip>
    )
  }

  function renderTenantTable(rows: TenantRecord[]): React.ReactNode {
    if (rows.length === 0) {
      return (
        <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-md border bg-muted/30">
            <Building2 className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">No tenants found</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Adjust the filters or provision the first tenant.
          </p>
        </div>
      )
    }

    return (
      <>
        <div className="divide-y md:hidden">
          {rows.map((tenant) => (
            <button
              key={tenant.slug}
              type="button"
              className="flex w-full min-w-0 items-center gap-3 px-5 py-4 text-left hover:bg-muted/20"
              onClick={() => openTenant(tenant.slug)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-white text-muted-foreground">
                <Building2 className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {tenant.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {tenant.slug}
                </span>
                <span className="mt-2 flex flex-wrap gap-2">
                  <TenantStatusBadge status={tenant.status} />
                  <BootstrapStatusBadge bootstrapStatus={tenant.bootstrapStatus} />
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-xs uppercase text-muted-foreground">
              <th className="px-5 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Bootstrap</th>
              <th className="px-4 py-3 font-medium">Medplum project</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="w-12 px-3 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tenant) => (
              <tr
                key={tenant.slug}
                className="border-b border-border/70 last:border-0 hover:bg-muted/20"
              >
                <td className="px-5 py-4">
                  <button
                    type="button"
                    className="group flex items-center gap-3 text-left"
                    onClick={() => openTenant(tenant.slug)}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-white text-muted-foreground group-hover:border-primary/30 group-hover:text-primary">
                      <Building2 className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground group-hover:text-primary">
                        {tenant.displayName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {tenant.slug}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-4 py-4"><TenantStatusBadge status={tenant.status} /></td>
                <td className="px-4 py-4">
                  <BootstrapStatusBadge bootstrapStatus={tenant.bootstrapStatus} />
                </td>
                <td className="max-w-52 truncate px-4 py-4 font-mono text-xs text-muted-foreground">
                  {tenant.medplumProjectId}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                  {formatDate(tenant.updatedAt)}
                </td>
                <td className="px-3 py-4">{renderTenantActions(tenant)}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </>
    )
  }

  function renderRecentTenants(): React.ReactNode {
    if (recentTenants.length === 0) {
      return (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No tenants provisioned yet.
        </div>
      )
    }

    return (
      <div className="divide-y">
        {recentTenants.map((tenant) => (
          <button
            key={tenant.slug}
            type="button"
            className="flex w-full min-w-0 items-center gap-3 px-5 py-4 text-left hover:bg-muted/20"
            onClick={() => openTenant(tenant.slug)}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-white text-muted-foreground">
              <Building2 className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {tenant.displayName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {tenant.slug}
              </span>
            </span>
            <span className="hidden shrink-0 items-center gap-2 md:flex">
              <TenantStatusBadge status={tenant.status} />
              <BootstrapStatusBadge bootstrapStatus={tenant.bootstrapStatus} />
            </span>
            <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {formatDate(tenant.updatedAt)}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-zinc-50 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <a
          href="#admin-main"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white focus:translate-y-0"
        >
          Skip to content
        </a>
        <aside className="hidden min-h-screen flex-col border-r bg-white lg:flex">
          <div className="flex h-16 items-center gap-3 border-b px-5">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">OZRYN</p>
              <p className="text-xs text-muted-foreground">Control Plane</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-3" aria-label="Admin navigation">
            <p className="px-3 pb-2 pt-3 text-xs font-medium uppercase text-muted-foreground">
              Operations
            </p>
            <button
              type="button"
              className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                view === 'overview'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
              onClick={() => navigate('overview')}
            >
              <LayoutDashboard className="size-4" />
              Overview
            </button>
            <button
              type="button"
              className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                view === 'tenants' || view === 'create' || view === 'detail'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
              onClick={() => navigate('tenants')}
            >
              <Building2 className="size-4" />
              Tenants
              <span className="ml-auto text-xs tabular-nums">{tenants.length}</span>
            </button>

            <p className="px-3 pb-2 pt-6 text-xs font-medium uppercase text-muted-foreground">
              Identity &amp; access
            </p>
            <button
              type="button"
              className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                view === 'members'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
              onClick={() => navigate('members')}
            >
              <Users className="size-4" />
              Members
            </button>
          </nav>

          <div className="border-t p-3">
            <div className="flex items-center gap-3 rounded-md px-2 py-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                {getInitials(adminEmail)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Platform operator</p>
                <p className="truncate text-xs text-muted-foreground">{adminEmail}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void handleLogout()}
                    disabled={isLoggingOut}
                    aria-label="Sign out"
                  >
                    <LogOut />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>

        <main id="admin-main" className="min-w-0">
          <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{pageTitle}</h1>
                <p className="truncate text-xs text-muted-foreground">{pageDescription}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {view !== 'create' ? (
                  <Button
                    type="button"
                    onClick={() => navigate('create')}
                    aria-label="Create tenant"
                  >
                    <Plus />
                    <span className="hidden sm:inline">New tenant</span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => void handleLogout()}
                  disabled={isLoggingOut}
                  aria-label="Sign out"
                >
                  <LogOut />
                </Button>
              </div>
            </div>
            <nav
              className="flex gap-1 overflow-x-auto border-t px-4 py-2 lg:hidden"
              aria-label="Mobile admin navigation"
            >
              <Button
                type="button"
                size="sm"
                variant={view === 'overview' ? 'secondary' : 'ghost'}
                onClick={() => navigate('overview')}
              >
                <LayoutDashboard />
                Overview
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  view === 'tenants' || view === 'create' || view === 'detail'
                    ? 'secondary'
                    : 'ghost'
                }
                onClick={() => navigate('tenants')}
              >
                <Building2 />
                Tenants
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === 'members' ? 'secondary' : 'ghost'}
                onClick={() => navigate('members')}
              >
                <Users />
                Members
              </Button>
            </nav>
          </header>

          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {notice ? (
              <Alert
                aria-live="polite"
                className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-900"
              >
                <CheckCircle2 />
                <AlertTitle>Saved</AlertTitle>
                <AlertDescription className="text-emerald-800">{notice}</AlertDescription>
              </Alert>
            ) : null}

            {view === 'overview' ? (
              <div className="space-y-8">
                <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                  {[
                    {
                      label: 'Total tenants',
                      value: tenants.length,
                      detail: 'Provisioned organizations',
                      icon: Building2,
                    },
                    {
                      label: 'Active',
                      value: activeTenants,
                      detail: 'Available through OZRYN',
                      icon: CheckCircle2,
                    },
                    {
                      label: 'Needs attention',
                      value: tenantsNeedingAttention.length,
                      detail: 'Manual bootstrap follow-up',
                      icon: AlertCircle,
                    },
                    {
                      label: 'Disabled',
                      value: disabledTenants,
                      detail: 'Retained but unavailable',
                      icon: Power,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="min-w-0 rounded-lg border bg-white p-4 sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">{metric.label}</p>
                          <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                            {metric.value}
                          </p>
                        </div>
                        <div className="hidden size-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 sm:flex">
                          <metric.icon className="size-4" />
                        </div>
                      </div>
                      <p className="mt-3 break-words text-xs text-muted-foreground">
                        {metric.detail}
                      </p>
                    </div>
                  ))}
                </section>

                <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 overflow-hidden rounded-lg border bg-white">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                      <div>
                        <h2 className="font-semibold">Recent tenants</h2>
                        <p className="text-sm text-muted-foreground">
                          Latest registry activity
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('tenants')}
                      >
                        View all
                        <ChevronRight />
                      </Button>
                    </div>
                    {renderRecentTenants()}
                  </div>

                  <div className="rounded-lg border bg-white">
                    <div className="border-b px-5 py-4">
                      <h2 className="font-semibold">Operational attention</h2>
                      <p className="text-sm text-muted-foreground">
                        Incomplete tenant bootstrap
                      </p>
                    </div>
                    <div className="divide-y">
                      {tenantsNeedingAttention.length === 0 ? (
                        <div className="px-5 py-8 text-center">
                          <CheckCircle2 className="mx-auto size-6 text-emerald-600" />
                          <p className="mt-3 text-sm font-medium">All tenants are ready</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            No manual provisioning work remains.
                          </p>
                        </div>
                      ) : (
                        tenantsNeedingAttention.map((tenant) => (
                          <button
                            key={tenant.slug}
                            type="button"
                            className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-muted/20"
                            onClick={() => openTenant(tenant.slug)}
                          >
                            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {tenant.displayName}
                              </span>
                              <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                                {tenant.lastProvisioningError || 'Manual follow-up required'}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {view === 'tenants' ? (
              <section className="overflow-hidden rounded-lg border bg-white">
                <div className="flex flex-col gap-4 border-b px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold">Tenant registry</h2>
                    <p className="text-sm text-muted-foreground">
                      {filteredTenants.length} of {tenants.length} tenants
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative sm:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        name="tenantSearch"
                        autoComplete="off"
                        value={tenantSearch}
                        onChange={(event) => setTenantSearch(event.target.value)}
                        placeholder="Search name, slug, or project"
                        className="pl-9"
                        aria-label="Search tenants"
                      />
                    </div>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={tenantStatusFilter}
                      onChange={(event) =>
                        setTenantStatusFilter(event.target.value as TenantStatusFilter)
                      }
                      aria-label="Filter tenants by status"
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>
                {renderTenantTable(filteredTenants)}
              </section>
            ) : null}

            {view === 'members' ? (
              <div className="space-y-6">
                {directoryError ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Membership directory is incomplete</AlertTitle>
                    <AlertDescription>{directoryError}</AlertDescription>
                  </Alert>
                ) : null}

                <section className="overflow-hidden rounded-lg border bg-white">
                  <div className="flex flex-col gap-4 border-b px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="font-semibold">Membership directory</h2>
                      <p className="text-sm text-muted-foreground">
                        {filteredDirectoryMemberships.length} of{' '}
                        {directoryMemberships.length} memberships
                      </p>
                    </div>
                    <div className="relative sm:w-80">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        name="memberSearch"
                        autoComplete="off"
                        value={memberSearch}
                        onChange={(event) => setMemberSearch(event.target.value)}
                        placeholder="Search member or tenant"
                        className="pl-9"
                        aria-label="Search memberships"
                      />
                    </div>
                  </div>

                  {isLoadingDirectory ? (
                    <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
                      Loading memberships…
                    </div>
                  ) : filteredDirectoryMemberships.length === 0 ? (
                    <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
                      <Users className="size-6 text-muted-foreground" />
                      <h3 className="mt-4 text-sm font-semibold">No memberships found</h3>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        Adjust the search or create tenant members from the tenant app.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="divide-y md:hidden">
                        {filteredDirectoryMemberships.map((membership) => (
                          <div key={membership.membershipId} className="space-y-4 px-5 py-5">
                            <div className="flex items-start gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
                                <UserRound className="size-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {membershipLabel(membership)}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {membership.email || membership.userName || 'No email'}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() => openTenant(membership.tenantSlug)}
                              >
                                {membership.tenantDisplayName}
                              </button>
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                              <select
                                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                                aria-label={`Role for ${membershipLabel(membership)}`}
                                value={membership.role}
                                onChange={(event) =>
                                  updateDirectoryMembership(membership.membershipId, {
                                    role: event.target.value as TenantBootstrapUserRole,
                                  })
                                }
                                disabled={savingMembershipId === membership.membershipId}
                              >
                                <option value="Staff">Staff</option>
                                <option value="TenantAdmin">Tenant admin</option>
                              </select>
                              <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={membership.active}
                                  onChange={(event) =>
                                    updateDirectoryMembership(membership.membershipId, {
                                      active: event.target.checked,
                                    })
                                  }
                                  disabled={savingMembershipId === membership.membershipId}
                                />
                                Active
                              </label>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() =>
                                void handleSaveMembership(
                                  membership,
                                  membership.tenantSlug,
                                )
                              }
                              disabled={savingMembershipId === membership.membershipId}
                            >
                              {savingMembershipId === membership.membershipId
                                ? 'Saving…'
                                : 'Save membership'}
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[980px] text-left text-sm">
                          <thead>
                            <tr className="border-b bg-muted/20 text-xs uppercase text-muted-foreground">
                              <th className="px-5 py-3 font-medium">Member</th>
                              <th className="px-4 py-3 font-medium">Tenant</th>
                              <th className="px-4 py-3 font-medium">Role</th>
                              <th className="px-4 py-3 font-medium">Status</th>
                              <th className="px-4 py-3 font-medium">Policy</th>
                              <th className="w-24 px-4 py-3">
                                <span className="sr-only">Save</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDirectoryMemberships.map((membership) => (
                              <tr
                                key={membership.membershipId}
                                className="border-b last:border-0"
                              >
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
                                      <UserRound className="size-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">
                                        {membershipLabel(membership)}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {membership.email || membership.userName || 'No email'}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <button
                                    type="button"
                                    className="font-medium text-primary hover:underline"
                                    onClick={() => openTenant(membership.tenantSlug)}
                                  >
                                    {membership.tenantDisplayName}
                                  </button>
                                </td>
                                <td className="px-4 py-4">
                                  <select
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    aria-label={`Role for ${membershipLabel(membership)}`}
                                    value={membership.role}
                                    onChange={(event) =>
                                      updateDirectoryMembership(membership.membershipId, {
                                        role: event.target.value as TenantBootstrapUserRole,
                                      })
                                    }
                                    disabled={
                                      savingMembershipId === membership.membershipId
                                    }
                                  >
                                    <option value="Staff">Staff</option>
                                    <option value="TenantAdmin">Tenant admin</option>
                                  </select>
                                </td>
                                <td className="px-4 py-4">
                                  <label className="inline-flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={membership.active}
                                      onChange={(event) =>
                                        updateDirectoryMembership(
                                          membership.membershipId,
                                          { active: event.target.checked },
                                        )
                                      }
                                      disabled={
                                        savingMembershipId === membership.membershipId
                                      }
                                    />
                                    {membership.active ? 'Active' : 'Inactive'}
                                  </label>
                                </td>
                                <td className="px-4 py-4 text-muted-foreground">
                                  {membership.accessPolicyName || 'Unknown'}
                                </td>
                                <td className="px-4 py-4">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      void handleSaveMembership(
                                        membership,
                                        membership.tenantSlug,
                                      )
                                    }
                                    disabled={
                                      savingMembershipId === membership.membershipId
                                    }
                                  >
                                    {savingMembershipId === membership.membershipId
                                      ? 'Saving…'
                                      : 'Save'}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>
              </div>
            ) : null}

            {view === 'create' ? (
              <form
                onSubmit={handleCreateTenant}
                className="mx-auto max-w-5xl overflow-hidden rounded-lg border bg-white"
              >
                <section className="grid gap-6 px-5 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-7">
                  <div>
                    <h2 className="font-semibold">Tenant identity</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Routing and operator-facing name.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField id="tenant-slug" label="Tenant slug" required>
                      <Input
                        id="tenant-slug"
                        name="tenantSlug"
                        autoComplete="off"
                        spellCheck={false}
                        value={slug}
                        onChange={(event) => setSlug(event.target.value)}
                        placeholder="rendal"
                        disabled={isSubmitting}
                        required
                      />
                    </FormField>
                    <FormField id="tenant-display-name" label="Display name" required>
                      <Input
                        id="tenant-display-name"
                        name="tenantDisplayName"
                        autoComplete="organization"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Rendal"
                        disabled={isSubmitting}
                        required
                      />
                    </FormField>
                  </div>
                </section>

                <Separator />

                <section className="grid gap-6 px-5 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-7">
                  <div>
                    <h2 className="font-semibold">Organization</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Stored in the tenant Medplum project.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField id="organization-legal-name" label="Legal name">
                      <Input
                        id="organization-legal-name"
                        name="organizationLegalName"
                        autoComplete="organization"
                        value={organizationProfile.legalName}
                        onChange={(event) =>
                          updateOrganizationProfileField('legalName', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-email" label="Contact email" required>
                      <Input
                        id="organization-email"
                        name="organizationEmail"
                        type="email"
                        autoComplete="email"
                        spellCheck={false}
                        value={organizationProfile.contactEmail}
                        onChange={(event) =>
                          updateOrganizationProfileField('contactEmail', event.target.value)
                        }
                        disabled={isSubmitting}
                        required
                      />
                    </FormField>
                    <FormField id="organization-phone" label="Contact phone">
                      <Input
                        id="organization-phone"
                        name="organizationPhone"
                        type="tel"
                        autoComplete="tel"
                        value={organizationProfile.contactPhone}
                        onChange={(event) =>
                          updateOrganizationProfileField('contactPhone', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-timezone" label="Timezone">
                      <Input
                        id="organization-timezone"
                        name="organizationTimezone"
                        autoComplete="off"
                        spellCheck={false}
                        value={organizationProfile.timezone}
                        onChange={(event) =>
                          updateOrganizationProfileField('timezone', event.target.value)
                        }
                        placeholder="America/Argentina/Buenos_Aires"
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-address-1" label="Address line 1">
                      <Input
                        id="organization-address-1"
                        name="organizationAddress1"
                        autoComplete="address-line1"
                        value={organizationProfile.line1}
                        onChange={(event) =>
                          updateOrganizationProfileField('line1', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-address-2" label="Address line 2">
                      <Input
                        id="organization-address-2"
                        name="organizationAddress2"
                        autoComplete="address-line2"
                        value={organizationProfile.line2}
                        onChange={(event) =>
                          updateOrganizationProfileField('line2', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-city" label="City">
                      <Input
                        id="organization-city"
                        name="organizationCity"
                        autoComplete="address-level2"
                        value={organizationProfile.city}
                        onChange={(event) =>
                          updateOrganizationProfileField('city', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-state" label="State / province">
                      <Input
                        id="organization-state"
                        name="organizationState"
                        autoComplete="address-level1"
                        value={organizationProfile.state}
                        onChange={(event) =>
                          updateOrganizationProfileField('state', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-postal-code" label="Postal code">
                      <Input
                        id="organization-postal-code"
                        name="organizationPostalCode"
                        autoComplete="postal-code"
                        value={organizationProfile.postalCode}
                        onChange={(event) =>
                          updateOrganizationProfileField('postalCode', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <FormField id="organization-country" label="Country">
                      <Input
                        id="organization-country"
                        name="organizationCountry"
                        autoComplete="country-name"
                        value={organizationProfile.country}
                        onChange={(event) =>
                          updateOrganizationProfileField('country', event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                  </div>
                </section>

                <Separator />

                <section className="grid gap-6 px-5 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-7">
                  <div>
                    <h2 className="font-semibold">Primary administrator</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      First administrator for the project.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField id="admin-first-name" label="First name" required>
                      <Input
                        id="admin-first-name"
                        name="adminFirstName"
                        autoComplete="given-name"
                        value={primaryAdmin.firstName}
                        onChange={(event) =>
                          setPrimaryAdmin((current) => ({
                            ...current,
                            firstName: event.target.value,
                          }))
                        }
                        disabled={isSubmitting}
                        required
                      />
                    </FormField>
                    <FormField id="admin-last-name" label="Last name" required>
                      <Input
                        id="admin-last-name"
                        name="adminLastName"
                        autoComplete="family-name"
                        value={primaryAdmin.lastName}
                        onChange={(event) =>
                          setPrimaryAdmin((current) => ({
                            ...current,
                            lastName: event.target.value,
                          }))
                        }
                        disabled={isSubmitting}
                        required
                      />
                    </FormField>
                    <FormField id="admin-email" label="Email" required>
                      <Input
                        id="admin-email"
                        name="adminEmail"
                        type="email"
                        autoComplete="email"
                        spellCheck={false}
                        value={primaryAdmin.email}
                        onChange={(event) =>
                          setPrimaryAdmin((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        disabled={isSubmitting}
                        required
                      />
                    </FormField>
                    <FormField id="admin-password" label="Local development password">
                      <Input
                        id="admin-password"
                        name="adminPassword"
                        type="password"
                        autoComplete="new-password"
                        value={primaryAdmin.password}
                        onChange={(event) =>
                          setPrimaryAdmin((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        disabled={isSubmitting}
                      />
                    </FormField>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        name="adminSendEmail"
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
                </section>

                <Separator />

                <section className="grid gap-6 px-5 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-7">
                  <div>
                    <h2 className="font-semibold">Initial users</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Optional project members created during bootstrap.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() =>
                        setInitialUsers((currentUsers) => [
                          ...currentUsers,
                          emptyBootstrapUser(),
                        ])
                      }
                      disabled={isSubmitting}
                    >
                      <Plus />
                      Add user
                    </Button>
                  </div>
                  <div className="divide-y">
                    {initialUsers.length === 0 ? (
                      <div className="flex min-h-28 items-center justify-center border border-dashed px-4 text-sm text-muted-foreground">
                        No additional users
                      </div>
                    ) : null}
                    {initialUsers.map((user, index) => (
                      <div key={index} className="py-5 first:pt-0 last:pb-0">
                        <div className="mb-4 flex items-center justify-between">
                          <p className="text-sm font-medium">User {index + 1}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
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
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField id={`user-${index}-first-name`} label="First name">
                            <Input
                              id={`user-${index}-first-name`}
                              name={`initialUsers.${index}.firstName`}
                              autoComplete="off"
                              value={user.firstName}
                              onChange={(event) =>
                                updateInitialUser(index, {
                                  firstName: event.target.value,
                                })
                              }
                              disabled={isSubmitting}
                            />
                          </FormField>
                          <FormField id={`user-${index}-last-name`} label="Last name">
                            <Input
                              id={`user-${index}-last-name`}
                              name={`initialUsers.${index}.lastName`}
                              autoComplete="off"
                              value={user.lastName}
                              onChange={(event) =>
                                updateInitialUser(index, {
                                  lastName: event.target.value,
                                })
                              }
                              disabled={isSubmitting}
                            />
                          </FormField>
                          <FormField id={`user-${index}-email`} label="Email">
                            <Input
                              id={`user-${index}-email`}
                              name={`initialUsers.${index}.email`}
                              type="email"
                              autoComplete="off"
                              spellCheck={false}
                              value={user.email}
                              onChange={(event) =>
                                updateInitialUser(index, { email: event.target.value })
                              }
                              disabled={isSubmitting}
                            />
                          </FormField>
                          <FormField id={`user-${index}-role`} label="Role">
                            <select
                              id={`user-${index}-role`}
                              name={`initialUsers.${index}.role`}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={user.role}
                              onChange={(event) =>
                                updateInitialUser(index, {
                                  role: event.target.value as TenantBootstrapUserRole,
                                })
                              }
                              disabled={isSubmitting}
                            >
                              <option value="Staff">Staff</option>
                              <option value="TenantAdmin">Tenant admin</option>
                            </select>
                          </FormField>
                          <FormField id={`user-${index}-password`} label="Local password">
                            <Input
                              id={`user-${index}-password`}
                              name={`initialUsers.${index}.password`}
                              type="password"
                              autoComplete="new-password"
                              value={user.password}
                              onChange={(event) =>
                                updateInitialUser(index, {
                                  password: event.target.value,
                                })
                              }
                              disabled={isSubmitting}
                            />
                          </FormField>
                          <label className="flex items-end gap-2 pb-2 text-sm">
                            <input
                              name={`initialUsers.${index}.sendEmail`}
                              type="checkbox"
                              checked={user.sendEmail}
                              onChange={(event) =>
                                updateInitialUser(index, {
                                  sendEmail: event.target.checked,
                                })
                              }
                              disabled={isSubmitting}
                            />
                            Send invite email
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {createError ? (
                  <div className="border-t bg-destructive/5 px-5 py-4 text-sm text-destructive lg:px-7">
                    {createError}
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-3 border-t bg-zinc-50 px-5 py-4 lg:px-7">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('tenants')}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Provisioning…' : 'Create tenant'}
                  </Button>
                </div>
              </form>
            ) : null}

            {view === 'detail' ? (
              <div className="space-y-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="flex items-start gap-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => navigate('tenants')}
                          aria-label="Back to tenants"
                        >
                          <ArrowLeft />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Back to tenants</TooltipContent>
                    </Tooltip>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">
                          {tenantDetail?.tenant.displayName || selectedTenant?.displayName}
                        </h2>
                        {tenantDetail ? (
                          <>
                            <TenantStatusBadge status={tenantDetail.tenant.status} />
                            <BootstrapStatusBadge
                              bootstrapStatus={tenantDetail.tenant.bootstrapStatus}
                            />
                          </>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedTenantSlug}
                      </p>
                    </div>
                  </div>
                  {tenantDetail ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditDialogOpen(true)}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      {tenantDetail.tenant.status === 'active' ? (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setStatusDialogOpen(true)}
                        >
                          <Power />
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => setStatusDialogOpen(true)}
                        >
                          <RotateCcw />
                          Reactivate
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>

                {detailError ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Tenant operation failed</AlertTitle>
                    <AlertDescription>{detailError}</AlertDescription>
                  </Alert>
                ) : null}

                {isLoadingTenantWorkspace ? (
                  <div className="flex min-h-72 items-center justify-center rounded-lg border bg-white text-sm text-muted-foreground">
                    Loading tenant…
                  </div>
                ) : null}

                {!isLoadingTenantWorkspace && tenantDetail ? (
                  <Tabs defaultValue="summary" className="gap-5">
                    <TabsList>
                      <TabsTrigger value="summary">
                        <CircleGauge />
                        Summary
                      </TabsTrigger>
                      <TabsTrigger value="organization">
                        <Building2 />
                        Organization
                      </TabsTrigger>
                      <TabsTrigger value="members">
                        <Users />
                        Members
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="space-y-6">
                      {tenantDetail.tenant.lastProvisioningError ? (
                        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                          <AlertCircle />
                          <AlertTitle>Bootstrap follow-up required</AlertTitle>
                          <AlertDescription className="whitespace-pre-line text-amber-900">
                            {tenantDetail.tenant.lastProvisioningError}
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      {createResult?.tenant.slug === tenantDetail.tenant.slug &&
                      createResult.manualSteps.length > 0 ? (
                        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                          <AlertCircle />
                          <AlertTitle>Provisioning completed with manual steps</AlertTitle>
                          <AlertDescription className="text-amber-900">
                            <ul className="list-disc space-y-1 pl-4">
                              {createResult.manualSteps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      <div className="grid gap-6 xl:grid-cols-2">
                        <section className="rounded-lg border bg-white px-5">
                          <div className="border-b py-4">
                            <h3 className="font-semibold">Tenant registry</h3>
                          </div>
                          <dl>
                            <DetailItem label="Tenant ID" value={tenantDetail.tenant.id} />
                            <DetailItem label="Slug" value={tenantDetail.tenant.slug} />
                            <DetailItem
                              label="Created"
                              value={formatDate(tenantDetail.tenant.createdAt)}
                            />
                            <DetailItem
                              label="Last updated"
                              value={formatDate(tenantDetail.tenant.updatedAt)}
                            />
                          </dl>
                        </section>
                        <section className="rounded-lg border bg-white px-5">
                          <div className="border-b py-4">
                            <h3 className="font-semibold">Medplum binding</h3>
                          </div>
                          <dl>
                            <DetailItem
                              label="Project ID"
                              value={
                                <span className="font-mono text-xs">
                                  {tenantDetail.tenant.medplumProjectId}
                                </span>
                              }
                            />
                            <DetailItem
                              label="Client ID"
                              value={
                                <span className="font-mono text-xs">
                                  {tenantDetail.tenant.medplumClientId}
                                </span>
                              }
                            />
                            <DetailItem
                              label="Organization ID"
                              value={
                                <span className="font-mono text-xs">
                                  {tenantDetail.tenant.medplumOrganizationId}
                                </span>
                              }
                            />
                            <DetailItem
                              label="Members"
                              value={`${memberships.length} practitioner memberships`}
                            />
                          </dl>
                        </section>
                      </div>
                    </TabsContent>

                    <TabsContent value="organization">
                      <section className="rounded-lg border bg-white">
                        <div className="flex items-center justify-between border-b px-5 py-4">
                          <div>
                            <h3 className="font-semibold">Organization profile</h3>
                            <p className="text-sm text-muted-foreground">
                              Operational identity stored in Medplum
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditDialogOpen(true)}
                          >
                            <Pencil />
                            Edit
                          </Button>
                        </div>
                        {tenantDetail.organizationProfile ? (
                          <dl className="grid px-5 sm:grid-cols-2 sm:gap-x-8">
                            <DetailItem
                              label="Legal name"
                              value={tenantDetail.organizationProfile.legalName}
                            />
                            <DetailItem
                              label="Contact email"
                              value={tenantDetail.organizationProfile.contactEmail}
                            />
                            <DetailItem
                              label="Contact phone"
                              value={tenantDetail.organizationProfile.contactPhone}
                            />
                            <DetailItem
                              label="Timezone"
                              value={tenantDetail.organizationProfile.timezone}
                            />
                            <DetailItem
                              label="Address"
                              value={[
                                tenantDetail.organizationProfile.address?.line1,
                                tenantDetail.organizationProfile.address?.line2,
                                tenantDetail.organizationProfile.address?.city,
                                tenantDetail.organizationProfile.address?.state,
                                tenantDetail.organizationProfile.address?.postalCode,
                                tenantDetail.organizationProfile.address?.country,
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            />
                          </dl>
                        ) : (
                          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                            Organization profile is unavailable until bootstrap is repaired.
                          </div>
                        )}
                      </section>
                    </TabsContent>

                    <TabsContent value="members">
                      <section className="overflow-hidden rounded-lg border bg-white">
                        <div className="border-b px-5 py-4">
                          <h3 className="font-semibold">Project memberships</h3>
                          <p className="text-sm text-muted-foreground">
                            Support-level role and activation controls
                          </p>
                        </div>
                        {memberships.length === 0 ? (
                          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                            No practitioner memberships found.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-left text-sm">
                              <thead>
                                <tr className="border-b bg-muted/20 text-xs uppercase text-muted-foreground">
                                  <th className="px-5 py-3 font-medium">Member</th>
                                  <th className="px-4 py-3 font-medium">Role</th>
                                  <th className="px-4 py-3 font-medium">Status</th>
                                  <th className="px-4 py-3 font-medium">Policy</th>
                                  <th className="w-24 px-4 py-3"><span className="sr-only">Save</span></th>
                                </tr>
                              </thead>
                              <tbody>
                                {memberships.map((membership) => (
                                  <tr
                                    key={membership.membershipId}
                                    className="border-b last:border-0"
                                  >
                                    <td className="px-5 py-4">
                                      <div className="flex items-center gap-3">
                                        <div className="flex size-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
                                          <UserRound className="size-4" />
                                        </div>
                                        <div>
                                          <p className="font-medium">
                                            {membershipLabel(membership)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {membership.email || membership.userName || 'No email'}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4">
                                      <select
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                        aria-label={`Role for ${membershipLabel(membership)}`}
                                        value={membership.role}
                                        onChange={(event) =>
                                          updateMembership(membership.membershipId, {
                                            role: event.target.value as TenantBootstrapUserRole,
                                          })
                                        }
                                        disabled={
                                          savingMembershipId === membership.membershipId
                                        }
                                      >
                                        <option value="Staff">Staff</option>
                                        <option value="TenantAdmin">Tenant admin</option>
                                      </select>
                                    </td>
                                    <td className="px-4 py-4">
                                      <label className="inline-flex items-center gap-2 text-sm">
                                        <input
                                          type="checkbox"
                                          checked={membership.active}
                                          onChange={(event) =>
                                            updateMembership(membership.membershipId, {
                                              active: event.target.checked,
                                            })
                                          }
                                          disabled={
                                            savingMembershipId === membership.membershipId
                                          }
                                        />
                                        {membership.active ? 'Active' : 'Inactive'}
                                      </label>
                                    </td>
                                    <td className="px-4 py-4 text-muted-foreground">
                                      {membership.accessPolicyName || 'Unknown'}
                                    </td>
                                    <td className="px-4 py-4">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          void handleSaveMembership(membership)
                                        }
                                        disabled={
                                          savingMembershipId === membership.membershipId
                                        }
                                      >
                                        {savingMembershipId === membership.membershipId
                                          ? 'Saving…'
                                          : 'Save'}
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </TabsContent>
                  </Tabs>
                ) : null}
              </div>
            ) : null}
          </div>
        </main>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Edit tenant</DialogTitle>
              <DialogDescription>
                Update the OZRYN tenant label and Medplum organization profile.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveTenant} className="space-y-6">
              <FormField id="edit-display-name" label="Display name" required>
                <Input
                  id="edit-display-name"
                  name="editDisplayName"
                  autoComplete="organization"
                  value={tenantEditorDisplayName}
                  onChange={(event) => setTenantEditorDisplayName(event.target.value)}
                  disabled={isSavingTenant}
                  required
                />
              </FormField>

              {tenantDetail?.organizationProfile ? (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      ['legalName', 'Legal name'],
                      ['contactEmail', 'Contact email'],
                      ['contactPhone', 'Contact phone'],
                      ['timezone', 'Timezone'],
                      ['line1', 'Address line 1'],
                      ['line2', 'Address line 2'],
                      ['city', 'City'],
                      ['state', 'State / province'],
                      ['postalCode', 'Postal code'],
                      ['country', 'Country'],
                    ].map(([key, label]) => {
                      const field = key as keyof OrganizationProfileFormState
                      const id = `edit-${key}`
                      return (
                        <FormField key={key} id={id} label={label}>
                          <Input
                            id={id}
                            name={`edit${key[0]?.toUpperCase()}${key.slice(1)}`}
                            autoComplete="off"
                            type={
                              key === 'contactEmail'
                                ? 'email'
                                : key === 'contactPhone'
                                  ? 'tel'
                                  : 'text'
                            }
                            spellCheck={key === 'contactEmail' ? false : undefined}
                            value={tenantEditorProfile[field]}
                            onChange={(event) =>
                              updateTenantEditorProfileField(field, event.target.value)
                            }
                            disabled={isSavingTenant}
                          />
                        </FormField>
                      )
                    })}
                  </div>
                </>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  disabled={isSavingTenant}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSavingTenant}>
                  {isSavingTenant ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {tenantDetail?.tenant.status === 'active'
                  ? 'Deactivate tenant?'
                  : 'Reactivate tenant?'}
              </DialogTitle>
              <DialogDescription>
                {tenantDetail?.tenant.status === 'active'
                  ? 'The tenant will stop resolving through OZRYN. Its Medplum project and clinical data remain intact.'
                  : 'The tenant will become available through its OZRYN hostname again.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatusDialogOpen(false)}
                disabled={isChangingTenantStatus}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={
                  tenantDetail?.tenant.status === 'active' ? 'destructive' : 'default'
                }
                onClick={() =>
                  void changeTenantStatus(
                    tenantDetail?.tenant.status === 'active' ? 'disabled' : 'active',
                  )
                }
                disabled={isChangingTenantStatus}
              >
                {tenantDetail?.tenant.status === 'active' ? <Power /> : <RotateCcw />}
                {isChangingTenantStatus
                  ? 'Saving…'
                  : tenantDetail?.tenant.status === 'active'
                    ? 'Deactivate tenant'
                    : 'Reactivate tenant'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
