import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCarePlan,
  buildComposition,
  buildConditionResources,
  buildCoverage,
  buildDiagnosticReportResources,
  buildDialysisQuestionnaireResponse,
  buildDialysisServiceRequest,
  buildDocumentReference,
  buildEncounterResources,
  buildImmunizationResources,
  buildMedicationStatementResources,
  buildObservationResources,
  buildPatient,
  buildProcedureResources,
} from './fhir'
import type { PatientImportPreview } from './types'

const preview: PatientImportPreview = {
  schemaVersion: 1,
  createdAt: '2026-08-13T12:00:00.000Z',
  tenant: {
    slug: 'synthetic',
    targetProjectId: '11111111-1111-4111-8111-111111111111',
    targetOrganizationId: '22222222-2222-4222-8222-222222222222',
  },
  source: {
    absolutePath: '/private/synthetic/history.docx',
    filename: 'history.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 100,
    modifiedAt: '2026-08-13T12:00:00.000Z',
    sha256: 'a'.repeat(64),
    sha256Base64: 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
  },
  patientKey: 'b'.repeat(24),
  ozrynMrn: 'REN-BBBBBBBBBBBB',
  extraction: {
    patient: {
      fullName: 'FAMILIA NOMBRE',
      familyName: 'FAMILIA',
      givenNames: ['NOMBRE'],
      birthDate: '1960-01-01',
      dni: '12345678',
      coverageName: 'COBERTURA DEMO',
      coverageMemberId: 'DEMO-1',
      addressText: 'CALLE DEMO 123',
    },
    firstDialysisDate: '2025-01-01',
    dialysis: { DÍAS: 'LUNES MIÉRCOLES VIERNES' },
    sections: [{ key: 'header', title: 'Cabecera', lines: ['Texto <seguro> & fiel'] }],
    structured: {
      conditions: [{ key: 'condition-1', display: 'Condición documentada', sourceText: 'Fuente' }],
      procedures: [{ key: 'procedure-1', display: 'Procedimiento documentado', sourceText: 'Fuente', performedDate: '2025-01-01' }],
      medications: [{ key: 'medication-1', display: 'Medicación documental', dosageText: '5 mg cada 12 horas', sourceText: 'Fuente' }],
      encounters: [{ key: 'encounter-1', display: 'Internación', period: { start: '2025-01-01', end: '2025-01-02' }, sourceText: 'Fuente' }],
      diagnosticReports: [{ key: 'report-1', sectionKey: 'evolutions', display: 'Resultados de laboratorio extraídos — Enero 2025', sourceText: 'Hto/Hb 40/13', effectivePeriod: { start: '2025-01-01', end: '2025-01-31' }, status: 'partial', observationKeys: ['observation-1'] }],
      observations: [{ key: 'observation-1', reportKey: 'report-1', code: 'hematocrit', display: 'Hematocrito', value: 40, effectivePeriod: { start: '2025-01-01', end: '2025-01-31' }, sourceText: 'Hto/Hb 40/13' }],
      immunizations: [{ key: 'immunization-1', display: 'Anti-HBV', occurrenceText: 'Fecha no consignada', sourceText: 'ANTI HBV' }],
      evolutions: [{ key: 'report-1', year: 2025, month: 1, display: 'Enero 2025', period: { start: '2025-01-01', end: '2025-01-31' }, sourceText: 'Hto/Hb 40/13' }],
    },
    warnings: [],
  },
  plannedResourceTypes: ['Patient', 'Coverage', 'CarePlan', 'Composition', 'Binary', 'DocumentReference'],
  review: { approved: false, requiredChecks: [] },
}

test('builds the required FHIR resource shapes for the reviewed subset', () => {
  const patientId = '33333333-3333-4333-8333-333333333333'
  const compositionId = '44444444-4444-4444-8444-444444444444'
  const createdAt = '2026-08-13T12:00:00.000Z'
  const resources = [
    buildPatient(preview),
    buildCoverage(preview, patientId),
    buildCarePlan(preview, patientId),
    buildComposition(preview, patientId, createdAt),
    buildDocumentReference(
      preview,
      patientId,
      compositionId,
      createdAt,
      'Binary/55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555',
    ),
  ].filter((resource) => resource !== undefined)

  assert.deepEqual(
    resources.map((resource) => resource.resourceType),
    ['Patient', 'Coverage', 'CarePlan', 'Composition', 'DocumentReference'],
  )
  const composition = resources.find((resource) => resource.resourceType === 'Composition')
  assert.match(JSON.stringify(composition), /&lt;seguro&gt; &amp; fiel/)
  const patient = resources.find((resource) => resource.resourceType === 'Patient')
  assert.equal('gender' in (patient ?? {}), false)
  assert.deepEqual(patient?.resourceType === 'Patient' ? patient.address?.[0]?.line : undefined, [
    'CALLE DEMO 123',
  ])
})

test('builds source-derived resources with explicit validation limits', () => {
  const patientId = '33333333-3333-4333-8333-333333333333'
  const observations = buildObservationResources(preview, patientId)
  const reports = buildDiagnosticReportResources(
    preview,
    patientId,
    new Map([['observation-1', '55555555-5555-4555-8555-555555555555']]),
  )
  const questionnaire = buildDialysisQuestionnaireResponse(preview, patientId)
  const serviceRequest = buildDialysisServiceRequest(
    preview,
    patientId,
    '66666666-6666-4666-8666-666666666666',
  )

  assert.equal(buildConditionResources(preview, patientId)[0].resource.verificationStatus?.coding?.[0]?.code, 'unconfirmed')
  assert.equal(buildProcedureResources(preview, patientId)[0].resource.status, 'completed')
  assert.equal(buildMedicationStatementResources(preview, patientId)[0].resource.status, 'unknown')
  assert.equal(buildEncounterResources(preview, patientId)[0].resource.status, 'finished')
  assert.equal(buildImmunizationResources(preview, patientId)[0].resource.primarySource, false)
  assert.equal(observations[0].resource.status, 'preliminary')
  assert.equal(observations[0].resource.note, undefined)
  assert.equal(observations[0].resource.valueQuantity?.unit, undefined)
  assert.equal(reports[0].resource.status, 'partial')
  assert.equal(reports[0].resource.category?.[0]?.coding?.[0]?.code, 'LAB')
  assert.deepEqual(reports[0].resource.result, [
    { reference: 'Observation/55555555-5555-4555-8555-555555555555' },
  ])
  assert.equal(reports[0].resource.conclusion, undefined)
  assert.equal(questionnaire?.item?.[0]?.answer?.[0]?.valueString, 'LUNES MIÉRCOLES VIERNES')
  assert.equal(serviceRequest?.occurrenceTiming?.repeat?.frequency, 3)
  assert.equal(serviceRequest?.intent, 'plan')
})
