import assert from 'node:assert/strict'
import test from 'node:test'

import { parseClinicalHistoryText } from './parser'

const SYNTHETIC_HISTORY = `FAMILIA DOBLE NOMBRE SEGUNDO
FECHA DE NACIMIENTO: 08.08.63
EDAD: 60
DNI: 12345678 CUIL: 20-12345678-9
OOSS: COBERTURA DEMO: AF-123
DOMICILIO: CALLE FALSA 123
CONTACTO: FAMILIAR
EMAIL: demo@example.test
ETIOLOGÍA DE LA IRC: TEXTO CLÍNICO
PRIMERA DIALISIS VIDA DEL PACIENTE: 3-01-25
ANTECEDENTES PERSONALES
Antecedente narrativo que no debe convertirse en Condition.
VACUNACION
ANTI HBV
TRATAMIENTO AL INGRESO
Enalapril 5 mg c/ 12 hs
MODALIDAD DIALÍTICA
DÍAS: LUNES MIÉRCOLES VIERNES
Duración del tratamiento (min): 240
EVOLUCIONES2026
JULIO
Evolución clínica narrativa. LAB MENSUAL: Hto/Hb 40/13 - Ca/P 9/5 - urea pre/post 100/30.`

test('parses the RENDAL history template without inventing clinical facts', () => {
  const parsed = parseClinicalHistoryText(
    SYNTHETIC_HISTORY,
    '/private/pilot/FAMILIA DOBLE/FAMILIA DOBLE HC.docx',
  )

  assert.equal(parsed.patient.familyName, 'FAMILIA DOBLE')
  assert.deepEqual(parsed.patient.givenNames, ['NOMBRE', 'SEGUNDO'])
  assert.equal(parsed.patient.birthDate, '1963-08-08')
  assert.equal(parsed.patient.dni, '12345678')
  assert.equal(parsed.patient.cuil, '20123456789')
  assert.equal(parsed.patient.coverageName, 'COBERTURA DEMO')
  assert.equal(parsed.patient.coverageMemberId, 'AF-123')
  assert.equal(parsed.firstDialysisDate, '2025-01-03')
  assert.equal(parsed.dialysis.DÍAS, 'LUNES MIÉRCOLES VIERNES')
  assert.equal(parsed.sections.find((section) => section.key === 'evolutions')?.lines[0], 'JULIO')
  assert.equal(parsed.structured.medications[0]?.display, 'Enalapril')
  assert.equal(parsed.structured.immunizations[0]?.display, 'Vacuna contra hepatitis B')
  assert.equal(parsed.structured.evolutions[0]?.display, 'Julio 2026')
  assert.deepEqual(
    parsed.structured.observations.map((observation) => observation.code),
    ['hematocrit', 'hemoglobin', 'calcium', 'phosphorus', 'urea-pre', 'urea-post'],
  )
  assert.equal(parsed.structured.diagnosticReports.length, 1)
  assert.equal(parsed.structured.diagnosticReports[0]?.sectionKey, 'evolutions')
  assert.deepEqual(parsed.structured.diagnosticReports[0]?.observationKeys, [
    'evolution-2026-07-hematocrit-1',
    'evolution-2026-07-hemoglobin-1',
    'evolution-2026-07-calcium-1',
    'evolution-2026-07-phosphorus-1',
    'evolution-2026-07-urea-pre-1',
    'evolution-2026-07-urea-post-1',
  ])
  assert.equal('gender' in parsed.patient, false)
  assert.equal(parsed.warnings.some((warning) => warning.includes('stale or inconsistent')), true)
})
