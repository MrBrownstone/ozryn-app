import type { ProjectMembership } from '@medplum/fhirtypes'

import { getMedplum } from '@/lib/medplum'

export interface UserContext {
  profileRef: string
  orgId?: string
}

export interface ProjectUserContext extends UserContext {
  projectId?: string
  membership: ProjectMembership | null
  isProjectAdmin: boolean
}

export async function getProjectUserContext(): Promise<ProjectUserContext> {
  const medplum = getMedplum()
  const me = (await medplum.get('auth/me')) as any

  const profile = (medplum.getProfile() as any) || me?.profile
  if (!profile) {
    throw new Error('No active profile')
  }

  const profileRef =
    profile?.reference ??
    (profile?.resourceType && profile?.id
      ? `${profile.resourceType}/${profile.id}`
      : null)
  if (!profileRef) {
    throw new Error('Invalid active profile')
  }

  const projectId =
    me?.project?.id ??
    me?.projects?.[0]?.id ??
    profile?.project?.id

  let orgId: string | undefined
  let membership: ProjectMembership | null = null

  try {
    if (profileRef.startsWith('Practitioner/')) {
      const roles = await medplum.search('PractitionerRole', {
        practitioner: profileRef,
        _count: '1',
      })
      const role = roles?.entry?.[0]?.resource as any
      const orgRef: string | undefined = role?.organization?.reference
      if (orgRef) {
        orgId = orgRef.split('/')[1]
      }
    }
  } catch {}

  try {
    const memberships = await medplum.searchResources('ProjectMembership', {
      profile: profileRef,
      _count: '20',
    })

    membership =
      memberships.find(
        (candidate) =>
          !projectId || candidate.project?.reference === `Project/${projectId}`,
      ) ??
      memberships[0] ??
      null
  } catch {}

  return {
    profileRef,
    orgId,
    projectId,
    membership,
    isProjectAdmin: Boolean(membership?.admin),
  }
}

export async function getUserContext(): Promise<UserContext> {
  const { profileRef, orgId } = await getProjectUserContext()
  return { profileRef, orgId }
}
