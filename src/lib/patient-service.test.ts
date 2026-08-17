import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OZRYN_MRN_SYSTEM,
  buildDocumentReferenceResource,
  buildFollowUpSearchParams,
  buildFollowUpTaskResource,
  buildObservationResource,
  buildPatientResource,
} from '@/lib/patient-service'

test('buildPatientResource maps demographics and contact fields to Patient', () => {
  const patient = buildPatientResource({
    firstName: ' Ana ',
    lastName: ' Gomez ',
    birthDate: '1984-04-12',
    gender: 'female',
    mrn: ' OZ-123 ',
    phone: '+1 555 0100',
    email: 'ana@example.com',
    addressLine1: '123 Main St',
    city: 'Miami',
    state: 'FL',
    postalCode: '33101',
    country: 'US',
    active: true,
  })

  assert.equal(patient.resourceType, 'Patient')
  assert.equal(patient.name?.[0]?.given?.[0], 'Ana')
  assert.equal(patient.name?.[0]?.family, 'Gomez')
  assert.equal(patient.birthDate, '1984-04-12')
  assert.equal(patient.gender, 'female')
  assert.deepEqual(patient.identifier?.[0], {
    system: OZRYN_MRN_SYSTEM,
    value: 'OZ-123',
  })
  assert.equal(patient.telecom?.find((entry) => entry.system === 'email')?.value, 'ana@example.com')
  assert.equal(patient.address?.[0]?.city, 'Miami')
})

test('buildObservationResource creates a patient-scoped numeric observation', () => {
  const observation = buildObservationResource({
    patientId: 'patient-1',
    display: 'Systolic blood pressure',
    value: '120',
    unit: 'mmHg',
    effectiveDateTime: '2026-05-07T10:30:00.000Z',
    note: 'Taken seated',
  })

  assert.equal(observation.resourceType, 'Observation')
  assert.equal(observation.status, 'final')
  assert.equal(observation.subject?.reference, 'Patient/patient-1')
  assert.equal(observation.code?.text, 'Systolic blood pressure')
  assert.equal(observation.valueQuantity?.value, 120)
  assert.equal(observation.valueQuantity?.unit, 'mmHg')
  assert.equal(observation.note?.[0]?.text, 'Taken seated')
})

test('buildFollowUpTaskResource creates a patient follow-up task', () => {
  const task = buildFollowUpTaskResource({
    patientId: 'patient-1',
    description: 'Call patient after lab results',
    status: 'requested',
    priority: 'urgent',
    dueDate: '2026-05-10',
    ownerReference: 'Practitioner/practitioner-1',
  })

  assert.equal(task.resourceType, 'Task')
  assert.equal(task.status, 'requested')
  assert.equal(task.intent, 'order')
  assert.equal(task.priority, 'urgent')
  assert.equal(task.for?.reference, 'Patient/patient-1')
  assert.equal(task.executionPeriod?.end, '2026-05-10')
  assert.equal(task.owner?.reference, 'Practitioner/practitioner-1')
})

test('buildFollowUpSearchParams uses the Task patient search parameter supported by Medplum', () => {
  assert.deepEqual(buildFollowUpSearchParams('patient-1'), {
    patient: 'Patient/patient-1',
    _sort: '-_lastUpdated',
    _count: '25',
  })
})

test('buildDocumentReferenceResource rejects unsafe document URLs', () => {
  assert.throws(
    () =>
      buildDocumentReferenceResource({
        patientId: 'patient-1',
        title: 'Outside record',
        url: 'javascript:alert(1)',
      }),
    /http or https/,
  )
})

test('buildDocumentReferenceResource creates lightweight document metadata', () => {
  const document = buildDocumentReferenceResource({
    patientId: 'patient-1',
    title: 'Outside record',
    category: 'Referral',
    date: '2026-05-07T10:30:00.000Z',
    url: 'https://records.example/file.pdf',
  })

  assert.equal(document.resourceType, 'DocumentReference')
  assert.equal(document.status, 'current')
  assert.equal(document.subject?.reference, 'Patient/patient-1')
  assert.equal(document.type?.text, 'Referral')
  assert.equal(document.description, 'Outside record')
  assert.equal(document.content?.[0]?.attachment?.url, 'https://records.example/file.pdf')
})
