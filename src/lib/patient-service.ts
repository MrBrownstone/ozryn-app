import type {
  Annotation,
  Bundle,
  CarePlan,
  Composition,
  Condition,
  Coverage,
  DiagnosticReport,
  DocumentReference,
  Encounter,
  Immunization,
  MedicationStatement,
  Observation,
  Patient,
  Procedure,
  QuestionnaireResponse,
  Resource,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes'

import { getMedplum } from '@/lib/medplum'
import { getProjectUserContext } from '@/lib/session'

export const OZRYN_MRN_SYSTEM = 'https://ozryn.app/fhir/NamingSystem/mrn'
const AR_DNI_SYSTEM = 'https://ozryn.app/fhir/NamingSystem/ar-dni'
const AR_CUIL_SYSTEM = 'https://ozryn.app/fhir/NamingSystem/ar-cuil'

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
  if (!birthDate) return 'No consignada'
  const date = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return birthDate
  return new Intl.DateTimeFormat('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatAge(birthDate: string | undefined): string {
  if (!birthDate) return 'No consignada'

  const today = new Date()
  const dob = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(dob.getTime())) return 'No consignada'

  let age = today.getFullYear() - dob.getFullYear()
  const monthDelta = today.getMonth() - dob.getMonth()
  const dayDelta = today.getDate() - dob.getDate()

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1
  }

  return age >= 0 ? String(age) : 'No consignada'
}

function formatAddress(patient: Patient): string {
  const address = patient.address?.[0]
  if (!address) return 'No consignado'

  const line = address.line?.join(', ')
  return [line, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .join(', ')
}

function formatLastUpdated(lastUpdated: string | undefined): string {
  if (!lastUpdated) return 'No consignada'
  const date = new Date(lastUpdated)
  if (Number.isNaN(date.getTime())) return lastUpdated
  return new Intl.DateTimeFormat('es-AR', {
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

function formatClinicalDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function decodeXhtmlText(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16))
    if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(1), 10))
    return entities[key.toLowerCase()] ?? entity
  })
}

function narrativeLines(div: string | undefined): string[] {
  if (!div) return []
  const withBreaks = div
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeXhtmlText(withBreaks)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
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
  dni: string
  cuil: string
  address: string
  relatedContact: string
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
      : 'No consignado',
    dni: patient.identifier?.find((identifier) => identifier.system === AR_DNI_SYSTEM)?.value ?? 'No consignado',
    cuil: patient.identifier?.find((identifier) => identifier.system === AR_CUIL_SYSTEM)?.value ?? 'No consignado',
    address: formatAddress(patient),
    relatedContact: patient.contact?.[0]?.name?.text ?? 'No consignado',
    phone: patient.telecom?.find((entry) => entry.system === 'phone')?.value ?? 'No consignado',
    email: patient.telecom?.find((entry) => entry.system === 'email')?.value ?? 'No consignado',
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
      note: current.meta?.tag?.some(
        (tag) => tag.system === 'https://ozryn.app/fhir/CodeSystem/import-state',
      )
        ? 'Derivado del documento fuente; pendiente de validación clínica.'
        : current.note?.[0]?.text,
      recordedAt: current.effectivePeriod?.start
        ? formatClinicalDate(current.effectivePeriod.start)
        : formatDateTime(current.effectiveDateTime ?? current.meta?.lastUpdated),
      trend,
    })
    if (result.length >= count) break
  }

  return result
}

// ---------- Structured clinical record ----------

export interface UiClinicalEntry {
  id: string
  title: string
  detail?: string
  date?: string
  status?: string
  source?: string
}

export interface UiDialysisParameter {
  id: string
  label: string
  value: string
}

export interface UiEvolutionReport extends UiClinicalEntry {
  kind: 'evolution' | 'study'
  observations: Array<{
    id: string
    name: string
    value: string
    unit?: string
  }>
}

export interface UiNarrativeSection {
  title: string
  lines: string[]
}

export interface UiPatientClinicalRecord {
  conditions: UiClinicalEntry[]
  procedures: UiClinicalEntry[]
  medications: UiClinicalEntry[]
  encounters: UiClinicalEntry[]
  immunizations: UiClinicalEntry[]
  studies: UiEvolutionReport[]
  evolutions: UiEvolutionReport[]
  dialysis: {
    title: string
    status?: string
    schedule?: string
    parameters: UiDialysisParameter[]
  } | null
  coverage?: UiClinicalEntry
  narrativeSections: UiNarrativeSection[]
  warnings: string[]
}

function codeableText(value: { text?: string; coding?: Array<{ display?: string; code?: string }> } | undefined): string {
  return value?.text ?? value?.coding?.[0]?.display ?? value?.coding?.[0]?.code ?? 'Sin descripción'
}

function noteSource(notes: Array<{ text?: string }> | undefined): string | undefined {
  const value = notes?.[0]?.text
  return value?.replace(/^Texto fuente:\s*/i, '')
}

function questionnaireAnswer(answer: Record<string, unknown> | undefined): string {
  if (!answer) return 'Sin valor'
  for (const key of ['valueString', 'valueDecimal', 'valueInteger', 'valueBoolean', 'valueDate', 'valueDateTime', 'valueTime']) {
    if (answer[key] !== undefined) return String(answer[key])
  }
  const quantity = answer.valueQuantity as { value?: number; unit?: string; code?: string } | undefined
  if (quantity?.value !== undefined) {
    return [String(quantity.value), quantity.unit ?? quantity.code].filter(Boolean).join(' ')
  }
  const coding = answer.valueCoding as { display?: string; code?: string } | undefined
  return coding?.display ?? coding?.code ?? 'Sin valor'
}

export async function getPatientClinicalRecord(
  patientId: string,
): Promise<UiPatientClinicalRecord> {
  const medplum = getMedplum()
  const requests = [
    medplum.searchResources('Composition', { subject: `Patient/${patientId}`, _sort: '-date', _count: '5' }),
    medplum.searchResources('Condition', { subject: `Patient/${patientId}`, _count: '100' }),
    medplum.searchResources('Procedure', { subject: `Patient/${patientId}`, _sort: '-date', _count: '100' }),
    medplum.searchResources('MedicationStatement', { subject: `Patient/${patientId}`, _count: '100' }),
    medplum.searchResources('Encounter', { subject: `Patient/${patientId}`, _sort: '-date', _count: '100' }),
    medplum.searchResources('Immunization', { patient: `Patient/${patientId}`, _sort: '-date', _count: '100' }),
    medplum.searchResources('DiagnosticReport', { subject: `Patient/${patientId}`, _sort: '-date', _count: '100' }),
    medplum.searchResources('Observation', { subject: `Patient/${patientId}`, _sort: '-date', _count: '200' }),
    medplum.searchResources('QuestionnaireResponse', { subject: `Patient/${patientId}`, _sort: '-authored', _count: '10' }),
    medplum.searchResources('ServiceRequest', { subject: `Patient/${patientId}`, _sort: '-authored', _count: '10' }),
    medplum.searchResources('Coverage', { beneficiary: `Patient/${patientId}`, _count: '10' }),
  ]
  const labels = [
    'narrativa', 'condiciones', 'procedimientos', 'medicación', 'internaciones',
    'vacunación', 'informes', 'observaciones', 'parámetros de diálisis',
    'plan de diálisis', 'cobertura',
  ]
  const settled = await Promise.allSettled(requests)
  const warnings: string[] = []
  const at = <T extends Resource>(index: number): T[] => {
    const result = settled[index]
    if (result.status === 'rejected') {
      warnings.push(`No se pudo cargar ${labels[index]}.`)
      return []
    }
    return result.value as unknown as T[]
  }

  const compositions = at<Composition>(0)
  const conditions = at<Condition>(1)
  const procedures = at<Procedure>(2)
  const medications = at<MedicationStatement>(3)
  const encounters = at<Encounter>(4)
  const immunizations = at<Immunization>(5)
  const reports = at<DiagnosticReport>(6)
  const observations = at<Observation>(7)
  const questionnaires = at<QuestionnaireResponse>(8)
  const serviceRequests = at<ServiceRequest>(9)
  const coverages = at<Coverage>(10)
  const observationsById = new Map(observations.map((observation) => [observation.id, observation]))

  const reportItems = reports.map<UiEvolutionReport>((report) => {
    const effective = report.effectiveDateTime ?? report.effectivePeriod?.start
    const kind = report.category?.some(
      (category) => category.coding?.some((coding) => coding.code === 'LAB'),
    ) ? 'evolution' : 'study'
    return {
      id: report.id ?? '',
      title: codeableText(report.code),
      detail: report.conclusion,
      date: formatClinicalDate(effective),
      status: report.status,
      kind,
      observations: (report.result ?? []).flatMap((reference) => {
        const observation = observationsById.get(getReferenceId(reference.reference) ?? '')
        if (!observation?.id) return []
        const measured = observationValue(observation)
        return [{
          id: observation.id,
          name: codeableText(observation.code),
          value: measured.value,
          unit: measured.unit || undefined,
        }]
      }),
    }
  })

  const questionnaire = questionnaires[0]
  const serviceRequest = serviceRequests[0]
  const parameters: UiDialysisParameter[] = (questionnaire?.item ?? []).map((item, index) => ({
    id: item.linkId || String(index),
    label: item.text ?? item.linkId,
    value: questionnaireAnswer(item.answer?.[0] as unknown as Record<string, unknown> | undefined),
  }))

  return {
    conditions: conditions.map((condition) => ({
      id: condition.id ?? '',
      title: codeableText(condition.code),
      date: formatClinicalDate(condition.onsetDateTime),
      detail: condition.onsetAge?.value !== undefined
        ? `Inicio consignado a los ${condition.onsetAge.value} años`
        : undefined,
      status: condition.verificationStatus?.coding?.[0]?.code,
      source: noteSource(condition.note),
    })),
    procedures: procedures.map((procedure) => ({
      id: procedure.id ?? '',
      title: codeableText(procedure.code),
      date: formatClinicalDate(procedure.performedDateTime ?? procedure.performedPeriod?.start),
      status: procedure.status,
      source: noteSource(procedure.note),
    })),
    medications: medications.map((medication) => ({
      id: medication.id ?? '',
      title: codeableText(medication.medicationCodeableConcept),
      detail: medication.dosage?.[0]?.text,
      status: medication.status,
      source: noteSource(medication.note),
    })),
    encounters: encounters.map((encounter) => ({
      id: encounter.id ?? '',
      title: codeableText(encounter.type?.[0]),
      date: formatClinicalDate(encounter.period?.start),
      detail: encounter.period?.end
        ? `Hasta ${formatClinicalDate(encounter.period.end)}`
        : undefined,
      status: encounter.status,
    })),
    immunizations: immunizations.map((immunization) => ({
      id: immunization.id ?? '',
      title: codeableText(immunization.vaccineCode),
      detail: immunization.occurrenceString,
      status: immunization.status,
      source: noteSource(immunization.note),
    })),
    studies: reportItems.filter((report) => report.kind === 'study'),
    evolutions: reportItems.filter((report) => report.kind === 'evolution'),
    dialysis: parameters.length || serviceRequest
      ? {
          title: codeableText(serviceRequest?.code),
          status: serviceRequest?.status,
          schedule: serviceRequest?.occurrenceTiming?.code?.text,
          parameters,
        }
      : null,
    coverage: coverages[0]
      ? {
          id: coverages[0].id ?? '',
          title: coverages[0].payor?.[0]?.display ?? 'Cobertura',
          detail: coverages[0].subscriberId,
          status: coverages[0].status,
        }
      : undefined,
    narrativeSections: (compositions[0]?.section ?? []).map((section) => ({
      title: section.title ?? 'Sección clínica',
      lines: narrativeLines(section.text?.div),
    })).filter((section) => section.lines.length > 0),
    warnings,
  }
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
  const tasks = await medplum.searchResources('Task', buildFollowUpSearchParams(patientId))

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

export function buildFollowUpSearchParams(patientId: string): Record<string, string> {
  return {
    patient: `Patient/${patientId}`,
    _sort: '-_lastUpdated',
    _count: '25',
  }
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
    let url: string | undefined
    try {
      url = normalizeExternalUrl(attachment?.url)
    } catch {
      url = undefined
    }
    return {
      id: document.id ?? '',
      title: document.description ?? attachment?.title ?? 'Document',
      category: document.type?.text ?? 'Clinical document',
      date: formatDateTime(document.date ?? document.meta?.lastUpdated),
      url,
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
