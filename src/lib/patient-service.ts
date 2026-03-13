import { medplum } from "./medplum"
import type { Bundle, Patient, Observation, CarePlan } from "@medplum/fhirtypes"

function bundleToResources<T = any>(bundle: Bundle | undefined): T[] {
  if (!bundle?.entry) return []
  return bundle.entry.map((e) => e.resource as T).filter(Boolean)
}

// ---------- Patients ----------

export interface UiPatientListItem {
  id: string
  name: string
  mrn: string
  status: "active" | "pending" | "inactive"
  lastVisitRaw: string
}

export interface UiPatientDetail {
  id: string
  name: string
  mrn: string
  status: "active" | "inactive"
  birthDate: string
  age: string
  gender: string
  address: string
  lastUpdated: string
}

function formatPatientName(patient: Patient): string {
  const name = patient.name?.[0]
  return [name?.given?.[0], name?.family].filter(Boolean).join(" ") || "(no name)"
}

function formatPatientMrn(patient: Patient): string {
  return (
    patient.identifier?.[0]?.value ??
    (patient.id ? `MRN-${patient.id.substring(0, 8).toUpperCase()}` : "—")
  )
}

function formatBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return "Unknown"
  const date = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return birthDate
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

function formatAge(birthDate: string | undefined): string {
  if (!birthDate) return "Unknown"

  const today = new Date()
  const dob = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(dob.getTime())) return "Unknown"

  let age = today.getFullYear() - dob.getFullYear()
  const monthDelta = today.getMonth() - dob.getMonth()
  const dayDelta = today.getDate() - dob.getDate()

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1
  }

  return age >= 0 ? String(age) : "Unknown"
}

function formatAddress(patient: Patient): string {
  const address = patient.address?.[0]
  if (!address) return "No address on file"

  const line = address.line?.join(", ")
  return [line, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .join(", ")
}

function formatLastUpdated(lastUpdated: string | undefined): string {
  if (!lastUpdated) return "Unknown"
  const date = new Date(lastUpdated)
  if (Number.isNaN(date.getTime())) return lastUpdated
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export async function searchPatientsForList(query: string): Promise<UiPatientListItem[]> {
  const params: Record<string, string> = {
    _summary: "true",
    _count: "25",
    _sort: "-_lastUpdated",
  }

  if (query.trim()) {
    params["name"] = query.trim()
  }

  const bundle = (await medplum.search("Patient", params)) as Bundle
  const patients = bundleToResources<Patient>(bundle)

  return patients.map((p) => {
    const status: UiPatientListItem["status"] =
      p.active === false ? "inactive" : "active"

    const lastVisitRaw = p.meta?.lastUpdated ?? ""

    return {
      id: p.id as string,
      name: formatPatientName(p),
      mrn: formatPatientMrn(p),
      status,
      lastVisitRaw,
    }
  })
}

export async function getPatientById(id: string): Promise<Patient | null> {
  try {
    return (await medplum.readResource("Patient", id)) as Patient
  } catch {
    return null
  }
}

export async function getPatientDetail(id: string): Promise<UiPatientDetail | null> {
  const patient = await getPatientById(id)
  if (!patient?.id) return null

  return {
    id: patient.id,
    name: formatPatientName(patient),
    mrn: formatPatientMrn(patient),
    status: patient.active === false ? "inactive" : "active",
    birthDate: formatBirthDate(patient.birthDate),
    age: formatAge(patient.birthDate),
    gender: patient.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : "Unknown",
    address: formatAddress(patient),
    lastUpdated: formatLastUpdated(patient.meta?.lastUpdated),
  }
}

// ---------- Observations ----------

export interface UiObservationItem {
  name: string
  value: string
  unit: string
  reference?: string
  trend: "up" | "down" | "stable"
}

export async function getRecentObservations(
  patientId: string,
  count = 4,
): Promise<UiObservationItem[]> {
  const bundle = (await medplum.search("Observation", {
    subject: `Patient/${patientId}`,
    _sort: "-date",
    _count: String(count * 2),
  })) as Bundle

  const obs = bundleToResources<Observation>(bundle)

  const groups = new Map<string, Observation[]>()
  for (const o of obs) {
    const key =
      o.code?.coding?.[0]?.code ??
      o.code?.text ??
      (o.id ? `obs-${o.id}` : "unknown")
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(o)
  }

  const result: UiObservationItem[] = []

  for (const [, list] of groups) {
    if (!list.length) continue
    const current = list[0]
    const previous = list[1]

    const valueQ = current.valueQuantity
    if (!valueQ) continue

    const name =
      current.code?.text ??
      current.code?.coding?.[0]?.display ??
      "Observation"

    const value = String(valueQ.value ?? "")
    const unit = valueQ.unit ?? valueQ.code ?? ""

    let reference: string | undefined
    const ref = current.referenceRange?.[0]
    if (ref) {
      if (ref.text) reference = ref.text
      else {
        const low = ref.low?.value
        const high = ref.high?.value
        const u = ref.low?.unit ?? ref.high?.unit ?? unit
        if (low != null && high != null) reference = `${low}-${high} ${u}`
        else if (low != null) reference = `>${low} ${u}`
        else if (high != null) reference = `<${high} ${u}`
      }
    }

    let trend: UiObservationItem["trend"] = "stable"
    if (previous?.valueQuantity?.value != null && valueQ.value != null) {
      const diff =
        Number(valueQ.value) - Number(previous.valueQuantity.value)
      if (diff > 0.5) trend = "up"
      else if (diff < -0.5) trend = "down"
    }

    result.push({ name, value, unit, reference, trend })
    if (result.length >= count) break
  }

  return result
}

// ---------- Care Plans ----------

export interface UiCarePlanItem {
  id: string
  task: string
  status: "completed" | "in-progress" | "pending"
  dueDate: string
}

export async function getCarePlanItems(
  patientId: string,
  count = 4,
): Promise<UiCarePlanItem[]> {
  const bundle = (await medplum.search("CarePlan", {
    subject: `Patient/${patientId}`,
    _sort: "-period-start",
    _count: String(count),
  })) as Bundle

  const cps = bundleToResources<CarePlan>(bundle)

  return cps.slice(0, count).map((cp) => {
    const title = cp.title
    const firstActivity = cp.activity?.[0]
    const desc = firstActivity?.detail?.description

    const task = title || desc || "Care plan item"

    const rawStatus = String(cp.status ?? "active")
    let status: UiCarePlanItem["status"] = "in-progress"
    if (rawStatus === "completed") status = "completed"
    else if (rawStatus === "draft" || rawStatus === "proposed")
      status = "pending"

    const scheduled = firstActivity?.detail?.scheduledString
    const due =
      scheduled ??
      cp.period?.end ??
      "Ongoing"

    return {
      id: cp.id ?? task,
      task,
      status,
      dueDate: due,
    }
  })
}
