import type {
  Annotation,
  Bundle,
  CarePlan,
  DocumentReference,
  Observation,
  Patient,
  Task,
} from '@medplum/fhirtypes'

import { getMedplum } from '@/lib/medplum'
import { getProjectUserContext } from '@/lib/session'

export const OZRYN_MRN_SYSTEM = 'https://ozryn.app/fhir/NamingSystem/mrn'

function bundleToResources<T = any>(bundle: Bundle | undefined): T[] {
  if (!bundle?.entry) return []
  return bundle.entry.map((e) => e.resource as T).filter(Boolean)
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function requireText(value: string | undefined, label: string): string {
  const normalized = normalizeText(value)
  if (!normalized) {
    throw new Error(`${label} is required.`)
  }

  return normalized
}

function toIsoDateTime(value: string | undefined): string {
  const normalized = normalizeText(value)
  if (!normalized) {
    return new Date().toISOString()
  }

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? normalized : date.toISOString()
}

function toDateOnly(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)
  if (!normalized) {
    return undefined
  }

  return normalized.slice(0, 10)
}

function buildAnnotation(value: string | undefined): Annotation[] | undefined {
  const text = normalizeText(value)
  return text ? [{ text }] : undefined
}

function formatPatientName(patient: Patient): string {
  const name = patient.name?.[0]
  return [name?.given?.[0], name?.family].filter(Boolean).join(' ') || '(no name)'
}

function formatPatientMrn(patient: Patient): string {
  return (
    patient.identifier?.find((identifier) => identifier.system === OZRYN_MRN_SYSTEM)?.value ??
    patient.identifier?.[0]?.value ??
    (patient.id ? `MRN-${patient.id.substring(0, 8).toUpperCase()}` : '-')
  )
}

function formatBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return 'Unknown'
  const date = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return birthDate
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatAge(birthDate: string | undefined): string {
  if (!birthDate) return 'Unknown'

  const today = new Date()
  const dob = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(dob.getTime())) return 'Unknown'

  let age = today.getFullYear() - dob.getFullYear()
  const monthDelta = today.getMonth() - dob.getMonth()
  const dayDelta = today.getDate() - dob.getDate()

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1
  }

  return age >= 0 ? String(age) : 'Unknown'
}

function formatAddress(patient: Patient): string {
  const address = patient.address?.[0]
  if (!address) return 'No address on file'

  const line = address.line?.join(', ')
  return [line, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .join(', ')
}

function formatLastUpdated(lastUpdated: string | undefined): string {
  if (!lastUpdated) return 'Unknown'
  const date = new Date(lastUpdated)
  if (Number.isNaN(date.getTime())) return lastUpdated
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDateTime(value: string | undefined): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Unknown'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function normalizeExternalUrl(value: string | undefined): string | undefined {
  const url = normalizeText(value)
  if (!url) {
    return undefined
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Document URL must use http or https.')
    }

    return parsed.toString()
  } catch (error) {
    if (error instanceof Error && error.message.includes('http')) {
      throw error
    }

    throw new Error('Document URL must be a valid URL.')
  }
}

function getReferenceId(reference: string | undefined): string | null {
  const [, id] = reference?.split('/') ?? []
  return id ?? null
}

function observationValue(observation: Observation): {
  value: string
  unit: string
} {
  if (observation.valueQuantity) {
    return {
      value: String(observation.valueQuantity.value ?? ''),
      unit: observation.valueQuantity.unit ?? observation.valueQuantity.code ?? '',
    }
  }

  if (observation.valueString) {
    return {
      value: observation.valueString,
      unit: '',
    }
  }

  return {
    value: '',
    unit: '',
  }
}

// ---------- Patients ----------

export interface UiPatientListItem {
  id: string
  name: string
  mrn: string
  status: 'active' | 'pending' | 'inactive'
  lastVisitRaw: string
}

export interface UiPatientDetail {
  id: string
  name: string
  mrn: string
  status: 'active' | 'inactive'
  birthDate: string
  age: string
  gender: string
  address: string
  phone: string
  email: string
  lastUpdated: string
}

export interface PatientFormInput {
  firstName: string
  lastName: string
  birthDate?: string
  gender?: Patient['gender'] | ''
  mrn?: string
  phone?: string
  email?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  active: boolean
}

export function patientToFormInput(patient: Patient): PatientFormInput {
  const name = patient.name?.[0]
  const address = patient.address?.[0]
  const [addressLine1, addressLine2] = address?.line ?? []

  return {
    firstName: name?.given?.[0] ?? '',
    lastName: name?.family ?? '',
    birthDate: patient.birthDate ?? '',
    gender: patient.gender ?? '',
    mrn:
      patient.identifier?.find((identifier) => identifier.system === OZRYN_MRN_SYSTEM)
        ?.value ??
      patient.identifier?.[0]?.value ??
      '',
    phone: patient.telecom?.find((entry) => entry.system === 'phone')?.value ?? '',
    email: patient.telecom?.find((entry) => entry.system === 'email')?.value ?? '',
    addressLine1: addressLine1 ?? '',
    addressLine2: addressLine2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
    active: patient.active !== false,
  }
}

export function buildPatientResource(
  input: PatientFormInput,
  existing?: Patient,
): Patient {
  const firstName = normalizeText(input.firstName)
  const lastName = normalizeText(input.lastName)
  if (!firstName && !lastName) {
    throw new Error('Patient first or last name is required.')
  }

  const mrn = normalizeText(input.mrn)
  const retainedIdentifiers = (existing?.identifier ?? []).filter(
    (identifier) =>
      identifier.system !== OZRYN_MRN_SYSTEM &&
      !(identifier.system === undefined && identifier.value === mrn),
  )

  const phone = normalizeText(input.phone)
  const email = normalizeText(input.email)
  const retainedTelecom = (existing?.telecom ?? []).filter(
    (entry) => entry.system !== 'phone' && entry.system !== 'email',
  )

  const addressLines = [
    normalizeText(input.addressLine1),
    normalizeText(input.addressLine2),
  ].filter(Boolean) as string[]
  const address = {
    ...(addressLines.length > 0 ? { line: addressLines } : undefined),
    city: normalizeText(input.city),
    state: normalizeText(input.state),
    postalCode: normalizeText(input.postalCode),
    country: normalizeText(input.country),
  }
  const hasAddress = Object.values(address).some(Boolean)

  return {
    ...existing,
    resourceType: 'Patient',
    name: [
      {
        given: firstName ? [firstName] : undefined,
        family: lastName,
      },
    ],
    active: input.active,
    birthDate: toDateOnly(input.birthDate),
    gender: input.gender || undefined,
    identifier: [
      ...(mrn
        ? [
            {
              system: OZRYN_MRN_SYSTEM,
              value: mrn,
            },
          ]
        : []),
      ...retainedIdentifiers,
    ],
    telecom: [
      ...(phone
        ? [
            {
              system: 'phone' as const,
              value: phone,
            },
          ]
        : []),
      ...(email
        ? [
            {
              system: 'email' as const,
              value: email,
            },
          ]
        : []),
      ...retainedTelecom,
    ],
    address: hasAddress ? [address] : undefined,
  }
}

export async function searchPatientsForList(query: string): Promise<UiPatientListItem[]> {
  const medplum = getMedplum()
  const params: Record<string, string> = {
    _summary: 'true',
    _count: '25',
    _sort: '-_lastUpdated',
  }

  if (query.trim()) {
    params.name = query.trim()
  }

  const bundle = (await medplum.search('Patient', params)) as Bundle
  const patients = bundleToResources<Patient>(bundle)

  return patients.map((p) => {
    const status: UiPatientListItem['status'] =
      p.active === false ? 'inactive' : 'active'

    return {
      id: p.id as string,
      name: formatPatientName(p),
      mrn: formatPatientMrn(p),
      status,
      lastVisitRaw: p.meta?.lastUpdated ?? '',
    }
  })
}

export async function getPatientById(id: string): Promise<Patient | null> {
  const medplum = getMedplum()
  try {
    return (await medplum.readResource('Patient', id)) as Patient
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
    status: patient.active === false ? 'inactive' : 'active',
    birthDate: formatBirthDate(patient.birthDate),
    age: formatAge(patient.birthDate),
    gender: patient.gender
      ? patient.gender[0].toUpperCase() + patient.gender.slice(1)
      : 'Unknown',
    address: formatAddress(patient),
    phone: patient.telecom?.find((entry) => entry.system === 'phone')?.value ?? 'None',
    email: patient.telecom?.find((entry) => entry.system === 'email')?.value ?? 'None',
    lastUpdated: formatLastUpdated(patient.meta?.lastUpdated),
  }
}

export async function createPatient(input: PatientFormInput): Promise<Patient> {
  const medplum = getMedplum()
  return (await medplum.createResource(buildPatientResource(input))) as Patient
}

export async function updatePatient(
  patientId: string,
  input: PatientFormInput,
): Promise<Patient> {
  const medplum = getMedplum()
  const existing = (await medplum.readResource('Patient', patientId)) as Patient
  return (await medplum.updateResource(
    buildPatientResource(input, existing),
  )) as Patient
}

// ---------- Observations ----------

export interface UiObservationItem {
  id?: string
  name: string
  value: string
  unit: string
  reference?: string
  note?: string
  recordedAt?: string
  trend: 'up' | 'down' | 'stable'
}

export interface ObservationInput {
  patientId: string
  display: string
  value: string
  unit?: string
  effectiveDateTime?: string
  note?: string
}

export function buildObservationResource(input: ObservationInput): Observation {
  const display = requireText(input.display, 'Observation name')
  const value = requireText(input.value, 'Observation value')
  const numericValue = Number(value)
  const unit = normalizeText(input.unit)

  return {
    resourceType: 'Observation',
    status: 'final',
    subject: {
      reference: `Patient/${requireText(input.patientId, 'Patient id')}`,
    },
    code: {
      text: display,
    },
    effectiveDateTime: toIsoDateTime(input.effectiveDateTime),
    ...(Number.isFinite(numericValue)
      ? {
          valueQuantity: {
            value: numericValue,
            unit,
            code: unit,
          },
        }
      : {
          valueString: value,
        }),
    note: buildAnnotation(input.note),
  }
}

export async function createObservation(input: ObservationInput): Promise<Observation> {
  const medplum = getMedplum()
  return (await medplum.createResource(
    buildObservationResource(input),
  )) as Observation
}

export async function getRecentObservations(
  patientId: string,
  count = 4,
): Promise<UiObservationItem[]> {
  const medplum = getMedplum()
  const bundle = (await medplum.search('Observation', {
    subject: `Patient/${patientId}`,
    _sort: '-date',
    _count: String(count * 3),
  })) as Bundle

  const obs = bundleToResources<Observation>(bundle)
  const groups = new Map<string, Observation[]>()
  for (const o of obs) {
    const key =
      o.code?.coding?.[0]?.code ??
      o.code?.text ??
      (o.id ? `obs-${o.id}` : 'unknown')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(o)
  }

  const result: UiObservationItem[] = []

  for (const [, list] of groups) {
    if (!list.length) continue
    const current = list[0]
    const previous = list[1]
    const currentValue = observationValue(current)

    if (!currentValue.value) continue

    const name =
      current.code?.text ??
      current.code?.coding?.[0]?.display ??
      'Observation'

    let reference: string | undefined
    const ref = current.referenceRange?.[0]
    if (ref) {
      if (ref.text) reference = ref.text
      else {
        const low = ref.low?.value
        const high = ref.high?.value
        const u = ref.low?.unit ?? ref.high?.unit ?? currentValue.unit
        if (low != null && high != null) reference = `${low}-${high} ${u}`
        else if (low != null) reference = `>${low} ${u}`
        else if (high != null) reference = `<${high} ${u}`
      }
    }

    let trend: UiObservationItem['trend'] = 'stable'
    const previousValue = previous ? observationValue(previous) : null
    if (previousValue?.value && currentValue.value) {
      const diff = Number(currentValue.value) - Number(previousValue.value)
      if (Number.isFinite(diff)) {
        if (diff > 0.5) trend = 'up'
        else if (diff < -0.5) trend = 'down'
      }
    }

    result.push({
      id: current.id,
      name,
      value: currentValue.value,
      unit: currentValue.unit,
      reference,
      note: current.note?.[0]?.text,
      recordedAt: formatDateTime(current.effectiveDateTime ?? current.meta?.lastUpdated),
      trend,
    })
    if (result.length >= count) break
  }

  return result
}

// ---------- Follow-up Tasks ----------

export type FollowUpTaskStatus = 'requested' | 'in-progress' | 'completed' | 'cancelled'

export interface FollowUpTaskInput {
  patientId: string
  description: string
  status?: FollowUpTaskStatus
  priority?: Task['priority']
  dueDate?: string
  ownerReference?: string
}

export interface UiFollowUpTask {
  id: string
  description: string
  status: FollowUpTaskStatus | string
  priority: string
  dueDate: string
  authoredOn: string
  owner: string
}

export function buildFollowUpTaskResource(
  input: FollowUpTaskInput,
  existing?: Task,
): Task {
  const dueDate = toDateOnly(input.dueDate)
  const ownerReference = normalizeText(input.ownerReference)

  return {
    ...existing,
    resourceType: 'Task',
    status: input.status ?? 'requested',
    intent: 'order',
    priority: input.priority ?? 'routine',
    description: requireText(input.description, 'Follow-up description'),
    for: {
      reference: `Patient/${requireText(input.patientId, 'Patient id')}`,
    },
    authoredOn: existing?.authoredOn ?? new Date().toISOString(),
    executionPeriod: dueDate ? { end: dueDate } : undefined,
    owner: ownerReference ? { reference: ownerReference } : existing?.owner,
  }
}

export async function createFollowUpTask(input: FollowUpTaskInput): Promise<Task> {
  const medplum = getMedplum()
  let ownerReference = input.ownerReference

  if (!ownerReference) {
    try {
      ownerReference = (await getProjectUserContext()).profileRef
    } catch {}
  }

  return (await medplum.createResource(
    buildFollowUpTaskResource({
      ...input,
      ownerReference,
    }),
  )) as Task
}

export async function updateFollowUpTaskStatus(
  taskId: string,
  status: FollowUpTaskStatus,
): Promise<Task> {
  const medplum = getMedplum()
  const existing = (await medplum.readResource('Task', taskId)) as Task
  const patientId = getReferenceId(existing.for?.reference)
  if (!patientId) {
    throw new Error('Task is not linked to a patient.')
  }

  return (await medplum.updateResource(
    buildFollowUpTaskResource(
      {
        patientId,
        description: existing.description ?? 'Follow-up',
        status,
        priority: existing.priority,
        dueDate: existing.executionPeriod?.end,
        ownerReference: existing.owner?.reference,
      },
      existing,
    ),
  )) as Task
}

export async function getFollowUpTasks(patientId: string): Promise<UiFollowUpTask[]> {
  const medplum = getMedplum()
  const tasks = await medplum.searchResources('Task', {
    for: `Patient/${patientId}`,
    _sort: '-_lastUpdated',
    _count: '25',
  })

  return (tasks as Task[]).map((task) => ({
    id: task.id ?? '',
    description: task.description ?? 'Follow-up',
    status: task.status ?? 'requested',
    priority: task.priority ?? 'routine',
    dueDate: formatDate(task.executionPeriod?.end),
    authoredOn: formatDateTime(task.authoredOn ?? task.meta?.lastUpdated),
    owner: task.owner?.display ?? task.owner?.reference ?? 'Unassigned',
  }))
}

// ---------- Lightweight Documents ----------

export interface PatientDocumentInput {
  patientId: string
  title: string
  category?: string
  date?: string
  url?: string
}

export interface UiPatientDocument {
  id: string
  title: string
  category: string
  date: string
  url?: string
}

export function buildDocumentReferenceResource(
  input: PatientDocumentInput,
): DocumentReference {
  const title = requireText(input.title, 'Document title')
  const url = normalizeExternalUrl(input.url)

  return {
    resourceType: 'DocumentReference',
    status: 'current',
    subject: {
      reference: `Patient/${requireText(input.patientId, 'Patient id')}`,
    },
    date: toIsoDateTime(input.date),
    type: normalizeText(input.category)
      ? {
          text: normalizeText(input.category),
        }
      : undefined,
    description: title,
    content: [
      {
        attachment: {
          title,
          url,
        },
      },
    ],
  }
}

export async function createPatientDocumentReference(
  input: PatientDocumentInput,
): Promise<DocumentReference> {
  const medplum = getMedplum()
  return (await medplum.createResource(
    buildDocumentReferenceResource(input),
  )) as DocumentReference
}

export async function getPatientDocuments(
  patientId: string,
): Promise<UiPatientDocument[]> {
  const medplum = getMedplum()
  const documents = await medplum.searchResources('DocumentReference', {
    subject: `Patient/${patientId}`,
    _sort: '-date',
    _count: '25',
  })

  return (documents as DocumentReference[]).map((document) => {
    const attachment = document.content?.[0]?.attachment
    return {
      id: document.id ?? '',
      title: document.description ?? attachment?.title ?? 'Document',
      category: document.type?.text ?? 'Clinical document',
      date: formatDateTime(document.date ?? document.meta?.lastUpdated),
      url: attachment?.url,
    }
  })
}

// ---------- Care Plans ----------

export interface UiCarePlanItem {
  id: string
  task: string
  status: 'completed' | 'in-progress' | 'pending'
  dueDate: string
}

function getCarePlanSortValue(carePlan: CarePlan): number {
  const candidates = [
    carePlan.period?.start,
    carePlan.period?.end,
    carePlan.meta?.lastUpdated,
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const value = new Date(candidate).getTime()
    if (!Number.isNaN(value)) {
      return value
    }
  }

  return 0
}

export async function getCarePlanItems(
  patientId: string,
  count = 4,
): Promise<UiCarePlanItem[]> {
  const medplum = getMedplum()
  const bundle = (await medplum.search('CarePlan', {
    subject: `Patient/${patientId}`,
    _sort: '-_lastUpdated',
    _count: String(Math.max(count * 3, 12)),
  })) as Bundle

  const cps = bundleToResources<CarePlan>(bundle).sort(
    (a, b) => getCarePlanSortValue(b) - getCarePlanSortValue(a),
  )

  return cps.slice(0, count).map((cp) => {
    const title = cp.title
    const firstActivity = cp.activity?.[0]
    const desc = firstActivity?.detail?.description

    const task = title || desc || 'Care plan item'

    const rawStatus = String(cp.status ?? 'active')
    let status: UiCarePlanItem['status'] = 'in-progress'
    if (rawStatus === 'completed') status = 'completed'
    else if (rawStatus === 'draft' || rawStatus === 'proposed') {
      status = 'pending'
    }

    const scheduled = firstActivity?.detail?.scheduledString
    const due = scheduled ?? cp.period?.end ?? 'Ongoing'

    return {
      id: cp.id ?? task,
      task,
      status,
      dueDate: due,
    }
  })
}
