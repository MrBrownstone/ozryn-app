export async function finalizeMedplumSession(medplum: any) {
  // Ask the server who we are and what profiles/projects are available
  const me: any = await medplum.get('auth/me')  // stable endpoint

  // If SDK already has a profile hydrated, we’re done
  if (medplum.getProfile() || me?.profile) return true

  // Try to find candidate profiles (shape can vary a bit by version/org setup)
  const candidates =
    me?.profiles ??
    (Array.isArray(me?.profile) ? me.profile : me?.profile ? [me.profile] : [])

  if (!candidates || candidates.length === 0) {
    throw new Error(
      'Authenticated but no profiles found in this Project. Create/link a Practitioner (or Patient) profile for this user.'
    )
  }

  // Pick the first for now. Later you can render a chooser if there are many.
  const chosen = candidates[0]

  // Normalize to the reference Medplum expects
  const profileRef =
    chosen?.reference ??
    `${chosen?.resourceType ?? 'Practitioner'}/${chosen?.id}`

  // Figure out the project id (present on me or on the profile)
  const projectId =
    me?.project?.id ??
    me?.projects?.[0]?.id ??
    chosen?.project?.id

  if (!profileRef || !projectId) {
    throw new Error('Could not resolve profile or project for session start.')
  }

  // Tell Medplum which profile/project to bind to this session
  await medplum.post('auth/profile', {
    profile: profileRef,
    projectId,
  })

  // Confirm
  const me2: any = await medplum.get('auth/me')
  if (!(medplum.getProfile() || me2?.profile)) {
    throw new Error('Session not established after profile selection.')
  }
  return true
}

