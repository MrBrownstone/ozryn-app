import type {
  CarePlan,
  Composition,
  Condition,
  Coverage,
  DiagnosticReport,
  DocumentReference,
  Encounter,
  Immunization,
  MedicationStatement,
  Meta,
  Observation,
  Patient,
  Procedure,
  QuestionnaireResponse,
  ServiceRequest,
} from '@medplum/fhirtypes'

import type {
  ExtractedDiagnosticReport,
  ExtractedObservation,
  PatientImportPreview,
} from './types'

export const SYSTEMS = {
  arDni: 'https://ozryn.app/fhir/NamingSystem/ar-dni',
  arCuil: 'https://ozryn.app/fhir/NamingSystem/ar-cuil',
  mrn: 'https://ozryn.app/fhir/NamingSystem/mrn',
  rendalPatientKey: 'https://ozryn.app/fhir/NamingSystem/rendal-patient-key',
  rendalDocument: 'https://ozryn.app/fhir/NamingSystem/rendal-document-sha256',
  rendalCoverage: 'https://ozryn.app/fhir/NamingSystem/rendal-coverage',
  rendalCarePlan: 'https://ozryn.app/fhir/NamingSystem/rendal-care-plan',
  rendalComposition: 'https://ozryn.app/fhir/NamingSystem/rendal-composition',
  rendalFact: 'https://ozryn.app/fhir/NamingSystem/rendal-source-fact',
  rendalQuestionnaireResponse: 'https://ozryn.app/fhir/NamingSystem/rendal-dialysis-parameters',
  rendalServiceRequest: 'https://ozryn.app/fhir/NamingSystem/rendal-dialysis-service-request',
  rendalObservation: 'https://ozryn.app/fhir/CodeSystem/rendal-observation',
  importSource: 'https://ozryn.app/fhir/CodeSystem/import-source',
  importState: 'https://ozryn.app/fhir/CodeSystem/import-state',
} as const

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildMeta(preview: PatientImportPreview): Meta {
  return {
    project: preview.tenant.targetProjectId,
    source: `urn:sha256:${preview.source.sha256}`,
    tag: [
      {
        system: SYSTEMS.importSource,
        code: 'rendal-docx',
        display: 'Imported from a RENDAL DOCX clinical history',
      },
      {
        system: SYSTEMS.importState,
        code: 'source-derived-unvalidated',
        display: 'Source-derived and not yet clinician-validated',
      },
    ],
  }
}

function factIdentifier(
  preview: PatientImportPreview,
  category: string,
  key: string,
): { system: string; value: string } {
  return {
    system: SYSTEMS.rendalFact,
    value: `${preview.patientKey}:${preview.source.sha256.slice(0, 16)}:${category}:${key}`,
  }
}

export function buildPatient(preview: PatientImportPreview): Patient {
  const source = preview.extraction.patient
  const identifiers: NonNullable<Patient['identifier']> = [
    { system: SYSTEMS.mrn, value: preview.ozrynMrn },
    { system: SYSTEMS.rendalPatientKey, value: preview.patientKey },
  ]
  if (source.dni) identifiers.push({ system: SYSTEMS.arDni, value: source.dni })
  if (source.cuil) identifiers.push({ system: SYSTEMS.arCuil, value: source.cuil })

  const telecom: NonNullable<Patient['telecom']> = []
  if (source.phone) telecom.push({ system: 'phone', value: source.phone, use: 'mobile' })
  if (source.email) telecom.push({ system: 'email', value: source.email })

  return {
    resourceType: 'Patient',
    meta: buildMeta(preview),
    active: true,
    identifier: identifiers,
    name: [
      {
        use: 'official',
        family: source.familyName,
        given: source.givenNames.length ? [source.givenNames.join(' ')] : undefined,
        text: source.fullName,
      },
    ],
    birthDate: source.birthDate,
    telecom: telecom.length ? telecom : undefined,
    address: source.addressText
      ? [{ use: 'home', text: source.addressText, line: [source.addressText] }]
      : undefined,
    contact: source.contactText
      ? [
          {
            name: { text: source.contactText },
            relationship: [{ text: 'Contacto consignado en la historia clínica' }],
          },
        ]
      : undefined,
  }
}

export function buildCoverage(
  preview: PatientImportPreview,
  patientId: string,
): Coverage | undefined {
  const source = preview.extraction.patient
  if (!source.coverageName) return undefined
  return {
    resourceType: 'Coverage',
    meta: buildMeta(preview),
    identifier: [
      {
        system: SYSTEMS.rendalCoverage,
        value: `${preview.patientKey}:${preview.source.sha256.slice(0, 16)}`,
      },
    ],
    status: 'draft',
    subscriberId: source.coverageMemberId,
    beneficiary: { reference: `Patient/${patientId}` },
    payor: [{ display: source.coverageName }],
  }
}

function dialysisDescription(preview: PatientImportPreview): string | undefined {
  const lines = Object.entries(preview.extraction.dialysis).map(
    ([label, value]) => `${label}: ${value}`,
  )
  return lines.length ? lines.join('\n') : undefined
}

export function buildCarePlan(
  preview: PatientImportPreview,
  patientId: string,
  serviceRequestId?: string,
  questionnaireResponseId?: string,
): CarePlan | undefined {
  const description = dialysisDescription(preview)
  if (!description) return undefined
  const days =
    Object.entries(preview.extraction.dialysis).find(([label]) =>
      label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().startsWith('DIAS'),
    )?.[1]
  return {
    resourceType: 'CarePlan',
    meta: buildMeta(preview),
    identifier: [
      {
        system: SYSTEMS.rendalCarePlan,
        value: `${preview.patientKey}:${preview.source.sha256.slice(0, 16)}`,
      },
    ],
    status: 'active',
    intent: 'plan',
    title: 'Esquema dialítico importado',
    description,
    subject: { reference: `Patient/${patientId}` },
    supportingInfo: questionnaireResponseId
      ? [{ reference: `QuestionnaireResponse/${questionnaireResponseId}` }]
      : undefined,
    period: preview.extraction.firstDialysisDate
      ? { start: preview.extraction.firstDialysisDate }
      : undefined,
    activity: [
      serviceRequestId
        ? {
            reference: { reference: `ServiceRequest/${serviceRequestId}` },
          }
        : {
        detail: {
          kind: 'ServiceRequest',
          code: { text: 'Tratamiento dialítico' },
          status: 'in-progress',
          scheduledString: days,
          performer: [
            { reference: `Organization/${preview.tenant.targetOrganizationId}` },
          ],
          description,
        },
          },
    ],
  }
}

export interface ImportedResourceTemplate<T> {
  key: string
  sectionKey: string
  resource: T
}

export function buildConditionResources(
  preview: PatientImportPreview,
  patientId: string,
): Array<ImportedResourceTemplate<Condition>> {
  return preview.extraction.structured.conditions.map((condition) => ({
    key: condition.key,
    sectionKey: condition.key === 'end-stage-kidney-disease'
      ? 'current-illness'
      : 'personal-history',
    resource: {
      resourceType: 'Condition',
      meta: buildMeta(preview),
      identifier: [factIdentifier(preview, 'condition', condition.key)],
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'unconfirmed',
            display: 'Unconfirmed',
          },
        ],
      },
      category: [{ text: 'Antecedente clínico importado' }],
      code: { text: condition.display },
      subject: { reference: `Patient/${patientId}` },
      onsetDateTime: condition.onsetDate,
      onsetAge: condition.onsetAge
        ? {
            value: condition.onsetAge,
            unit: 'años',
            system: 'http://unitsofmeasure.org',
            code: 'a',
          }
        : undefined,
      note: [{ text: `Texto fuente: ${condition.sourceText}` }],
    },
  }))
}

export function buildProcedureResources(
  preview: PatientImportPreview,
  patientId: string,
): Array<ImportedResourceTemplate<Procedure>> {
  return preview.extraction.structured.procedures.map((procedure) => ({
    key: procedure.key,
    sectionKey: procedure.performedPeriod ? 'admissions' : 'personal-history',
    resource: {
      resourceType: 'Procedure',
      meta: buildMeta(preview),
      identifier: [factIdentifier(preview, 'procedure', procedure.key)],
      status: 'completed',
      code: { text: procedure.display },
      subject: { reference: `Patient/${patientId}` },
      performedDateTime: procedure.performedDate,
      performedPeriod: procedure.performedPeriod,
      note: [{ text: `Texto fuente: ${procedure.sourceText}` }],
    },
  }))
}

export function buildEncounterResources(
  preview: PatientImportPreview,
  patientId: string,
): Array<ImportedResourceTemplate<Encounter>> {
  return preview.extraction.structured.encounters.map((encounter) => ({
    key: encounter.key,
    sectionKey: 'admissions',
    resource: {
      resourceType: 'Encounter',
      meta: buildMeta(preview),
      identifier: [factIdentifier(preview, 'encounter', encounter.key)],
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'Inpatient encounter',
      },
      type: [{ text: encounter.display }],
      subject: { reference: `Patient/${patientId}` },
      period: encounter.period,
      reasonCode: [{ text: encounter.display }],
    },
  }))
}

export function buildMedicationStatementResources(
  preview: PatientImportPreview,
  patientId: string,
): Array<ImportedResourceTemplate<MedicationStatement>> {
  return preview.extraction.structured.medications.map((medication) => ({
    key: medication.key,
    sectionKey: 'admission-treatment',
    resource: {
      resourceType: 'MedicationStatement',
      meta: buildMeta(preview),
      identifier: [factIdentifier(preview, 'medication-statement', medication.key)],
      status: 'unknown',
      category: { text: 'Tratamiento consignado al ingreso' },
      medicationCodeableConcept: { text: medication.display },
      subject: { reference: `Patient/${patientId}` },
      dosage: [{ text: medication.dosageText }],
      note: [{ text: `Texto fuente: ${medication.sourceText}` }],
    },
  }))
}

export function buildImmunizationResources(
  preview: PatientImportPreview,
  patientId: string,
): Array<ImportedResourceTemplate<Immunization>> {
  return preview.extraction.structured.immunizations.map((immunization) => ({
    key: immunization.key,
    sectionKey: 'vaccination',
    resource: {
      resourceType: 'Immunization',
      meta: buildMeta(preview),
      identifier: [factIdentifier(preview, 'immunization', immunization.key)],
      status: 'completed',
      vaccineCode: { text: immunization.display },
      patient: { reference: `Patient/${patientId}` },
      occurrenceString: immunization.occurrenceText,
      primarySource: false,
      reportOrigin: { text: 'Historia clínica RENDAL importada' },
      note: [{ text: `Texto fuente: ${immunization.sourceText}` }],
    },
  }))
}

export function buildDiagnosticReportResources(
  preview: PatientImportPreview,
  patientId: string,
  observationIds: Map<string, string>,
): Array<ImportedResourceTemplate<DiagnosticReport>> {
  return preview.extraction.structured.diagnosticReports.map((report) => ({
    key: report.key,
    sectionKey: report.sectionKey,
    resource: buildDiagnosticReport(preview, patientId, report, observationIds),
  }))
}

function buildDiagnosticReport(
  preview: PatientImportPreview,
  patientId: string,
  report: ExtractedDiagnosticReport,
  observationIds: Map<string, string>,
): DiagnosticReport {
  const result = report.observationKeys
    .map((key) => observationIds.get(key))
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ reference: `Observation/${id}` }))
  const laboratoryEvolution = report.sectionKey === 'evolutions'
  return {
    resourceType: 'DiagnosticReport',
    meta: buildMeta(preview),
    identifier: [factIdentifier(preview, 'diagnostic-report', report.key)],
    status: report.status,
    category: laboratoryEvolution
      ? [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'LAB',
            display: 'Laboratory',
          }],
        }]
      : [{ text: 'Estudio por imágenes' }],
    code: { text: report.display },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: report.effectiveDate,
    effectivePeriod: report.effectivePeriod,
    result: result.length ? result : undefined,
    // The full evolution remains in Composition and the DOCX. Repeating it as a
    // result-level note makes every laboratory row look like a separate narrative.
    conclusion: laboratoryEvolution ? undefined : report.sourceText,
  }
}

export function buildObservationResources(
  preview: PatientImportPreview,
  patientId: string,
): Array<ImportedResourceTemplate<Observation>> {
  return preview.extraction.structured.observations.map((observation) => ({
    key: observation.key,
    sectionKey: 'evolutions',
    resource: buildObservation(preview, patientId, observation),
  }))
}

function buildObservation(
  preview: PatientImportPreview,
  patientId: string,
  observation: ExtractedObservation,
): Observation {
  return {
    resourceType: 'Observation',
    meta: buildMeta(preview),
    identifier: [factIdentifier(preview, 'observation', observation.key)],
    status: 'preliminary',
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'laboratory',
        display: 'Laboratory',
      }],
    }],
    code: {
      coding: [{
        system: SYSTEMS.rendalObservation,
        code: observation.code,
        display: observation.display,
      }],
      text: observation.display,
    },
    subject: { reference: `Patient/${patientId}` },
    effectivePeriod: observation.effectivePeriod,
    valueQuantity: {
      value: observation.value,
      unit: observation.unit,
    },
  }
}

type QuestionnaireAnswer = NonNullable<
  NonNullable<QuestionnaireResponse['item']>[number]['answer']
>[number]

function parameterLinkId(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function dialysisAnswer(label: string, value: string): QuestionnaireAnswer {
  const numeric = /^-?\d+(?:[.,]\d+)?$/.test(value)
    ? Number(value.replace(',', '.'))
    : undefined
  if (numeric === undefined) return { valueString: value }
  const unitMatch = label.match(/\(([^)]+)\)/)
  if (unitMatch) {
    const unit = unitMatch[1]
    return {
      valueQuantity: {
        value: numeric,
        unit,
        ...(unit === 'min'
          ? { system: 'http://unitsofmeasure.org', code: 'min' }
          : {}),
      },
    }
  }
  return { valueDecimal: numeric }
}

export function buildDialysisQuestionnaireResponse(
  preview: PatientImportPreview,
  patientId: string,
): QuestionnaireResponse | undefined {
  const parameters = Object.entries(preview.extraction.dialysis)
  if (!parameters.length) return undefined
  return {
    resourceType: 'QuestionnaireResponse',
    meta: buildMeta(preview),
    identifier: {
      system: SYSTEMS.rendalQuestionnaireResponse,
      value: `${preview.patientKey}:${preview.source.sha256.slice(0, 16)}`,
    },
    status: 'completed',
    subject: { reference: `Patient/${patientId}` },
    authored: preview.source.modifiedAt,
    author: { reference: `Organization/${preview.tenant.targetOrganizationId}` },
    item: parameters.map(([label, value]) => ({
      linkId: parameterLinkId(label),
      text: label,
      answer: [dialysisAnswer(label, value)],
    })),
  }
}

function dialysisDays(value: string | undefined): Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> {
  if (!value) return []
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const mapping = [
    ['LUN', 'mon'],
    ['MAR', 'tue'],
    ['MIE', 'wed'],
    ['JUE', 'thu'],
    ['VIE', 'fri'],
    ['SAB', 'sat'],
    ['DOM', 'sun'],
  ] as const
  return mapping.filter(([token]) => normalized.includes(token)).map(([, day]) => day)
}

export function buildDialysisServiceRequest(
  preview: PatientImportPreview,
  patientId: string,
  questionnaireResponseId: string,
): ServiceRequest | undefined {
  if (!Object.keys(preview.extraction.dialysis).length) return undefined
  const schedule = Object.entries(preview.extraction.dialysis).find(([label]) =>
    label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().startsWith('DIAS'),
  )?.[1]
  const dayOfWeek = dialysisDays(schedule)
  return {
    resourceType: 'ServiceRequest',
    meta: buildMeta(preview),
    identifier: [
      {
        system: SYSTEMS.rendalServiceRequest,
        value: `${preview.patientKey}:${preview.source.sha256.slice(0, 16)}`,
      },
    ],
    status: 'active',
    intent: 'plan',
    category: [{ text: 'Terapia renal sustitutiva' }],
    code: { text: 'Hemodiálisis' },
    subject: { reference: `Patient/${patientId}` },
    occurrenceTiming: {
      code: { text: schedule },
      repeat: dayOfWeek.length
        ? {
            frequency: dayOfWeek.length,
            period: 1,
            periodUnit: 'wk',
            dayOfWeek,
          }
        : undefined,
    },
    supportingInfo: [{ reference: `QuestionnaireResponse/${questionnaireResponseId}` }],
    performer: [{ reference: `Organization/${preview.tenant.targetOrganizationId}` }],
    note: [
      {
        text: 'Plan derivado del documento fuente; requiere validación clínica antes de tratarlo como orden firmada.',
      },
    ],
  }
}

export function buildComposition(
  preview: PatientImportPreview,
  patientId: string,
  appliedAt: string,
  entries: Record<string, string[]> = {},
): Composition {
  const sections = preview.extraction.sections.map((section) => ({
    title: section.title,
    code: { text: section.title },
    text: {
      status: 'additional' as const,
      div: `<div xmlns="http://www.w3.org/1999/xhtml">${section.lines
        .map((line) => `<p>${escapeXml(line)}</p>`)
        .join('')}</div>`,
    },
    entry: entries[section.key]?.map((reference) => ({ reference })),
  }))
  return {
    resourceType: 'Composition',
    meta: buildMeta(preview),
    identifier: {
      system: SYSTEMS.rendalComposition,
      value: preview.source.sha256,
    },
    status: 'preliminary',
    type: { text: 'Historia clínica longitudinal importada' },
    subject: { reference: `Patient/${patientId}` },
    date: appliedAt,
    author: [{ reference: `Organization/${preview.tenant.targetOrganizationId}` }],
    title: 'Historia clínica RENDAL importada',
    confidentiality: 'R',
    custodian: { reference: `Organization/${preview.tenant.targetOrganizationId}` },
    section: sections,
  }
}

export function buildDocumentReference(
  preview: PatientImportPreview,
  patientId: string,
  compositionId: string,
  appliedAt: string,
  binaryUrl?: string,
  binaryId?: string,
): DocumentReference {
  const identifier = {
    system: SYSTEMS.rendalDocument,
    value: preview.source.sha256,
  }
  return {
    resourceType: 'DocumentReference',
    meta: buildMeta(preview),
    masterIdentifier: identifier,
    identifier: [identifier],
    status: 'current',
    type: { text: 'Historia clínica RENDAL (DOCX original)' },
    subject: { reference: `Patient/${patientId}` },
    date: appliedAt,
    author: [{ reference: `Organization/${preview.tenant.targetOrganizationId}` }],
    custodian: { reference: `Organization/${preview.tenant.targetOrganizationId}` },
    description: 'Historia clínica original importada',
    content: [
      {
        attachment: {
          contentType: preview.source.mediaType,
          url: binaryUrl,
          size: preview.source.size,
          hash: preview.source.sha256Base64,
          title: preview.source.filename,
        },
      },
    ],
    context: {
      related: [
        { reference: `Composition/${compositionId}` },
        ...(binaryId ? [{ reference: `Binary/${binaryId}` }] : []),
      ],
    },
  }
}
