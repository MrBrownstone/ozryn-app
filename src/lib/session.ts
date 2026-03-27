import { getMedplum } from "@/lib/medplum"

export interface UserContext {
  profileRef: string           // e.g., "Practitioner/abc"
  orgId?: string               // e.g., "2f9b..." (Organization id only)
}

export async function getUserContext(): Promise<UserContext> {
  const medplum = getMedplum()
  // Ensure we’re authenticated; processCode already stored tokens.
  const me = await medplum.get("auth/me") as any

  // medplum.getProfile() gives resource contents if already loaded
  const p = medplum.getProfile() as any || me?.profile
  if (!p) throw new Error("No active profile")

  const profileRef =
    p?.reference ??
    (p?.resourceType && p?.id ? `${p.resourceType}/${p.id}` : null)
  if (!profileRef) throw new Error("Invalid active profile")

  // Try to infer organization from PractitionerRole or profile’s managing organization
  // This is defensive; the AccessPolicy is the real guard.
  // If your model uses PractitionerRole, you can fetch it once and cache it.
  let orgId: string | undefined

  try {
    // Example: read PractitionerRole for this practitioner to find org
    if (profileRef.startsWith("Practitioner/")) {
      const roles = await medplum.search("PractitionerRole", {
        practitioner: profileRef,
        _count: "1",
      })
      const role = roles?.entry?.[0]?.resource as any
      const orgRef: string | undefined = role?.organization?.reference
      if (orgRef) orgId = orgRef.split("/")[1]
    }
  } catch { }

  return { profileRef, orgId }
}
