'use client'

import type { AccessPolicy, Practitioner, PractitionerRole, ProjectMembership, Reference } from '@medplum/fhirtypes'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getMedplum } from '@/lib/medplum'
import { getProjectUserContext, type ProjectUserContext } from '@/lib/session'
import {
  assertMembershipUpdateAllowed,
  buildMembershipAccess,
  getMembershipAccessPolicyReference,
  summarizeTenantMembership,
} from '@/lib/tenants/management'
import type { TenantBootstrapUserRole, TenantMembershipSummary } from '@/lib/tenants/types'

type InviteUserFormState = {
  firstName: string
  lastName: string
  email: string
  role: TenantBootstrapUserRole
  password: string
  sendEmail: boolean
}

function emptyInviteUser(): InviteUserFormState {
  return {
    firstName: '',
    lastName: '',
    email: '',
    role: 'Staff',
    password: '',
    sendEmail: true,
  }
}

function membershipLabel(membership: TenantMembershipSummary): string {
  return (
    membership.fullName || membership.email || membership.userName || membership.membershipId
  )
}

function sortMemberships(memberships: TenantMembershipSummary[]): TenantMembershipSummary[] {
  return [...memberships].sort((left, right) =>
    membershipLabel(left).localeCompare(membershipLabel(right)),
  )
}

async function ensurePractitionerRole(
  practitionerReference: string,
  organizationId: string,
  role: TenantBootstrapUserRole,
): Promise<void> {
  const medplum = getMedplum()
  const existingRoles = await medplum.searchResources('PractitionerRole', {
    practitioner: practitionerReference,
    organization: `Organization/${organizationId}`,
    _count: '1',
  })

  const existingRole = existingRoles[0]
  if (existingRole) {
    await medplum.updateResource({
      ...existingRole,
      active: true,
      code: [
        {
          text: role,
        },
      ],
    })
    return
  }

  await medplum.createResource({
    resourceType: 'PractitionerRole',
    active: true,
    practitioner: {
      reference: practitionerReference,
    },
    organization: {
      reference: `Organization/${organizationId}`,
    },
    code: [
      {
        text: role,
      },
    ],
  } satisfies PractitionerRole)
}

export function TenantUsersAdmin() {
  const [memberships, setMemberships] = useState<TenantMembershipSummary[]>([])
  const [membershipResources, setMembershipResources] = useState<
    Record<string, ProjectMembership>
  >({})
  const [policyReferences, setPolicyReferences] = useState<
    Partial<Record<TenantBootstrapUserRole, Reference<AccessPolicy>>>
  >({})
  const [currentContext, setCurrentContext] = useState<ProjectUserContext | null>(null)
  const [inviteUser, setInviteUser] = useState<InviteUserFormState>(emptyInviteUser())
  const [isLoading, setIsLoading] = useState(true)
  const [isInviting, setIsInviting] = useState(false)
  const [savingMembershipId, setSavingMembershipId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadWorkspace(): Promise<void> {
    setIsLoading(true)
    setError('')

    try {
      const medplum = getMedplum()
      const context = await getProjectUserContext()
      setCurrentContext(context)

      if (!context.membership || !context.isProjectAdmin) {
        setMemberships([])
        setMembershipResources({})
        setPolicyReferences({})
        return
      }

      const [membershipList, accessPolicies, practitionerRoles] = await Promise.all([
        medplum.searchResources('ProjectMembership', {
          'profile-type': 'Practitioner',
          _count: '200',
        }),
        medplum.searchResources('AccessPolicy', {
          _count: '50',
        }),
        context.orgId
          ? medplum.searchResources('PractitionerRole', {
              organization: `Organization/${context.orgId}`,
              _count: '200',
            })
          : Promise.resolve([] as PractitionerRole[]),
      ])

      const practitionerReferences = Array.from(
        new Set(
          membershipList
            .map((membership) => membership.profile?.reference)
            .filter((reference): reference is string =>
              Boolean(reference?.startsWith('Practitioner/')),
            ),
        ),
      )

      const practitioners = await Promise.all(
        practitionerReferences.map(async (reference) => {
          const practitionerId = reference.split('/')[1]
          const practitioner = await medplum.readResource('Practitioner', practitionerId)
          return [reference, practitioner] as const
        }),
      )

      const practitionerMap = new Map<string, Practitioner>(practitioners)
      const practitionerRoleMap = new Map(
        practitionerRoles
          .map((role) => [role.practitioner?.reference, role.id] as const)
          .filter(
            (entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1]),
          ),
      )
      const policyMap = new Map<string, string | undefined>(
        accessPolicies
          .filter((policy) => policy.id)
          .map((policy) => [`AccessPolicy/${policy.id as string}`, policy.name] as const),
      )

      const nextPolicyReferences: Partial<
        Record<TenantBootstrapUserRole, Reference<AccessPolicy>>
      > = {}

      for (const policy of accessPolicies) {
        if (!policy.id) {
          continue
        }

        if (policy.name === 'TenantAdmin' || policy.name === 'Staff') {
          nextPolicyReferences[policy.name] = {
            reference: `AccessPolicy/${policy.id}`,
          }
        }
      }

      setPolicyReferences(nextPolicyReferences)
      setMembershipResources(
        Object.fromEntries(
          membershipList
            .filter((membership) => membership.id)
            .map((membership) => [membership.id as string, membership]),
        ),
      )
      setMemberships(
        sortMemberships(
          membershipList
            .filter((membership) => membership.id)
            .map((membership) =>
              summarizeTenantMembership({
                membership,
                practitioner: membership.profile?.reference
                  ? practitionerMap.get(membership.profile.reference)
                  : undefined,
                accessPolicyName:
                  policyMap.get(getMembershipAccessPolicyReference(membership) ?? '') ?? null,
                practitionerRoleId: membership.profile?.reference
                  ? practitionerRoleMap.get(membership.profile.reference) ?? null
                  : null,
              }),
            ),
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load tenant user management.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadWorkspace()
  }, [])

  async function handleInvite(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIsInviting(true)
    setError('')
    setMessage('')

    try {
      if (!currentContext?.projectId) {
        throw new Error('Could not resolve the active Medplum project for this session.')
      }

      const policyReference = policyReferences[inviteUser.role]
      if (!policyReference) {
        throw new Error(`The ${inviteUser.role} access policy is not available in this project.`)
      }

      const medplum = getMedplum()
      const membership = (await medplum.post(
        `admin/projects/${currentContext.projectId}/invite`,
        {
          resourceType: 'Practitioner',
          firstName: inviteUser.firstName,
          lastName: inviteUser.lastName,
          email: inviteUser.email,
          scope: 'project',
          sendEmail: inviteUser.sendEmail,
          upsert: true,
          ...(inviteUser.password
            ? {
                password: inviteUser.password,
              }
            : undefined),
          membership: {
            admin: inviteUser.role === 'TenantAdmin',
            access: buildMembershipAccess(inviteUser.role, policyReference),
          },
        },
      )) as ProjectMembership

      if (
        currentContext.orgId &&
        membership.profile?.reference?.startsWith('Practitioner/')
      ) {
        await ensurePractitionerRole(
          membership.profile.reference,
          currentContext.orgId,
          inviteUser.role,
        )
      }

      setInviteUser(emptyInviteUser())
      setMessage(`Invited ${inviteUser.email} as ${inviteUser.role}.`)
      await loadWorkspace()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite user.')
    } finally {
      setIsInviting(false)
    }
  }

  async function handleSaveMembership(
    membership: TenantMembershipSummary,
  ): Promise<void> {
    setSavingMembershipId(membership.membershipId)
    setError('')
    setMessage('')

    try {
      const rawMembership = membershipResources[membership.membershipId]
      if (!rawMembership) {
        throw new Error('Could not resolve the selected membership resource.')
      }

      const policyReference = policyReferences[membership.role]
      if (!policyReference) {
        throw new Error(`The ${membership.role} access policy is not available in this project.`)
      }

      assertMembershipUpdateAllowed(
        Object.values(membershipResources),
        membership.membershipId,
        {
          role: membership.role,
          active: membership.active,
        },
      )

      const medplum = getMedplum()
      const updatedMembership = await medplum.updateResource({
        ...rawMembership,
        admin: membership.role === 'TenantAdmin',
        active: membership.active,
        access: buildMembershipAccess(membership.role, policyReference),
      })

      if (
        currentContext?.orgId &&
        updatedMembership.profile?.reference?.startsWith('Practitioner/')
      ) {
        await ensurePractitionerRole(
          updatedMembership.profile.reference,
          currentContext.orgId,
          membership.role,
        )
      }

      setMessage(`Updated ${membershipLabel(membership)}.`)
      await loadWorkspace()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update membership.')
    } finally {
      setSavingMembershipId(null)
    }
  }

  if (isLoading) {
    return (
      <Card className="border-border/60 p-6">
        <p className="text-sm text-muted-foreground">Loading tenant user management…</p>
      </Card>
    )
  }

  if (!currentContext?.membership || !currentContext.isProjectAdmin) {
    return (
      <Card className="border-border/60 p-6 space-y-2">
        <h2 className="text-xl font-semibold text-foreground">User Management</h2>
        <p className="text-sm text-muted-foreground">
          Only active tenant admins can manage project memberships from OZRYN.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <Card className="border-border/60 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Invite project-scoped staff and tenant admins, then manage their active
            memberships without leaving OZRYN.
          </p>
          {currentContext.orgId ? (
            <p className="text-xs text-muted-foreground">
              PractitionerRole links will be kept in sync with Organization/{currentContext.orgId}
              when possible.
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              This tenant does not have a resolved Organization link yet, so PractitionerRole
              automation is unavailable until bootstrap is repaired.
            </p>
          )}
        </div>
      </Card>

      {error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      <Card className="border-border/60 p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Invite User</h2>
          <p className="text-sm text-muted-foreground">
            New users are invited directly into this tenant&apos;s Medplum project.
          </p>
        </div>

        <form onSubmit={handleInvite} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={inviteUser.firstName}
              onChange={(event) =>
                setInviteUser((current) => ({
                  ...current,
                  firstName: event.target.value,
                }))
              }
              placeholder="First name"
              disabled={isInviting}
            />
            <Input
              value={inviteUser.lastName}
              onChange={(event) =>
                setInviteUser((current) => ({
                  ...current,
                  lastName: event.target.value,
                }))
              }
              placeholder="Last name"
              disabled={isInviting}
            />
            <Input
              value={inviteUser.email}
              onChange={(event) =>
                setInviteUser((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="clinician@example.com"
              disabled={isInviting}
            />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={inviteUser.role}
              onChange={(event) =>
                setInviteUser((current) => ({
                  ...current,
                  role: event.target.value as TenantBootstrapUserRole,
                }))
              }
              disabled={isInviting}
            >
              <option value="Staff">Staff</option>
              <option value="TenantAdmin">Tenant Admin</option>
            </select>
            <Input
              type="password"
              value={inviteUser.password}
              onChange={(event) =>
                setInviteUser((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder="Optional local-dev password"
              disabled={isInviting}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={inviteUser.sendEmail}
              onChange={(event) =>
                setInviteUser((current) => ({
                  ...current,
                  sendEmail: event.target.checked,
                }))
              }
              disabled={isInviting}
            />
            Send invite email
          </label>

          <Button type="submit" disabled={isInviting}>
            {isInviting ? 'Inviting...' : 'Invite User'}
          </Button>
        </form>
      </Card>

      <Card className="border-border/60 p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Current Memberships</h2>
          <p className="text-sm text-muted-foreground">
            Deactivation is soft-delete. The membership stays on record and access is revoked by
            setting it inactive.
          </p>
        </div>

        <div className="space-y-3">
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No practitioner memberships found in this tenant yet.
            </p>
          ) : null}

          {memberships.map((membership) => (
            <div
              key={membership.membershipId}
              className="rounded-md border border-border/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{membershipLabel(membership)}</p>
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
                    setMemberships((currentMemberships) =>
                      currentMemberships.map((candidate) =>
                        candidate.membershipId === membership.membershipId
                          ? {
                              ...candidate,
                              role: event.target.value as TenantBootstrapUserRole,
                            }
                          : candidate,
                      ),
                    )
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
                      setMemberships((currentMemberships) =>
                        currentMemberships.map((candidate) =>
                          candidate.membershipId === membership.membershipId
                            ? {
                                ...candidate,
                                active: event.target.checked,
                              }
                            : candidate,
                        ),
                      )
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
                  {savingMembershipId === membership.membershipId ? 'Saving...' : 'Save'}
                </Button>
              </div>

              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>Policy: {membership.accessPolicyName ?? 'Unknown'}</p>
                {membership.practitionerRoleId ? (
                  <p>PractitionerRole: {membership.practitionerRoleId}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
