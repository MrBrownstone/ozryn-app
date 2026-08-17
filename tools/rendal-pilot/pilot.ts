import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { MedplumClient } from '@medplum/core'
import type {
  Binary,
  CarePlan,
  Composition,
  Coverage,
  DiagnosticReport,
  DocumentReference,
  Patient,
  QuestionnaireResponse,
  Resource,
  ResourceType,
  ServiceRequest,
} from '@medplum/fhirtypes'

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
  SYSTEMS,
} from './fhir'
import type { ImportedResourceTemplate } from './fhir'
import { parseClinicalHistoryDocx } from './parser'
import { ensurePrivateDirectory, writePrivateFile, writePrivateJson } from './private-files'
import type {
  AppliedResource,
  PatientImportPreview,
  PatientImportResult,
} from './types'

const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function patientKeyFor(dni: string | undefined, sourcePath: string): string {
  const stableSource = dni
    ? `rendal|dni|${dni}`
    : `rendal|folder|${path.basename(path.dirname(sourcePath)).normalize('NFKC').toUpperCase()}`
  return sha256(stableSource).slice(0, 24)
}

function reviewMarkdown(preview: PatientImportPreview): string {
  const patient = preview.extraction.patient
  return `# Revisión previa — paciente ${preview.patientKey}\n\n` +
    `Este archivo contiene PHI y no debe salir de \`.tmp/RENDAL-PILOT\`.\n\n` +
    `- Nombre interpretado: ${patient.fullName}\n` +
    `- Apellido/s: ${patient.familyName}\n` +
    `- Nombre/s: ${patient.givenNames.join(' ')}\n` +
    `- Fecha de nacimiento: ${patient.birthDate ?? 'NO EXTRAÍDA'}\n` +
    `- DNI: ${patient.dni ?? 'NO EXTRAÍDO'}\n` +
    `- CUIL: ${patient.cuil ?? 'NO EXTRAÍDO'}\n` +
    `- MRN OZRYN generado: ${preview.ozrynMrn}\n` +
    `- Cobertura: ${patient.coverageName ?? 'NO EXTRAÍDA'}\n` +
    `- Primera diálisis: ${preview.extraction.firstDialysisDate ?? 'NO EXTRAÍDA'}\n` +
    `- Parámetros dialíticos: ${Object.keys(preview.extraction.dialysis).length}\n` +
    `- Secciones narrativas: ${preview.extraction.sections.length}\n` +
    `- Condiciones candidatas: ${preview.extraction.structured.conditions.length}\n` +
    `- Procedimientos: ${preview.extraction.structured.procedures.length}\n` +
    `- Medicaciones documentadas: ${preview.extraction.structured.medications.length}\n` +
    `- Informes diagnósticos extraídos: ${preview.extraction.structured.diagnosticReports.length}\n` +
    `- Valores numéricos extraídos: ${preview.extraction.structured.observations.length} (se importan como Observation preliminares, sin unidades inferidas)\n\n` +
    `## Advertencias\n\n${
      preview.extraction.warnings.length
        ? preview.extraction.warnings.map((warning) => `- ${warning}`).join('\n')
        : '- Ninguna advertencia del parser.'
    }\n\n` +
    `## Criterio de importación\n\n` +
    `Se conserva el DOCX original y la narrativa íntegra, y además se crean recursos FHIR separados para hechos que el documento expresa de forma inequívoca. Todos quedan marcados como derivados de la fuente y pendientes de validación clínica; no se inventan códigos terminológicos ni unidades ausentes.\n`
}

function experienceMarkdown(
  preview: PatientImportPreview,
  result?: PatientImportResult,
): string {
  const counts = result
    ? result.resources.reduce<Record<string, number>>((accumulator, resource) => {
        const key = `${resource.action}:${resource.resourceType}`
        accumulator[key] = (accumulator[key] ?? 0) + 1
        return accumulator
      }, {})
    : {}
  return `# Bitácora del piloto ${preview.patientKey}\n\n` +
    `- Esquema: ${preview.schemaVersion}\n` +
    `- Tenant: ${preview.tenant.slug}\n` +
    `- Proyecto Medplum: ${preview.tenant.targetProjectId}\n` +
    `- SHA-256 fuente: ${preview.source.sha256}\n` +
    `- Estado: ${result?.status ?? 'prepared'}\n\n` +
    `## Decisiones y traducciones\n\n` +
    `- La carpeta del paciente se usa solo para separar apellido/s de nombre/s; la identidad se reconcilia por DNI y fecha de nacimiento.\n` +
    `- Los años de dos dígitos se resuelven contra la edad declarada y el año clínico más reciente, dejando una advertencia.\n` +
    `- La obra social se guarda como Coverage en borrador, porque el DOCX no prueba vigencia administrativa.\n` +
    `- El esquema dialítico se representa como CarePlan + ServiceRequest con intención plan; los parámetros se guardan como QuestionnaireResponse. No se convierte en una orden firmada.\n` +
    `- Los antecedentes se traducen a Condition no confirmadas, Procedure históricas y MedicationStatement con estado desconocido.\n` +
    `- Los patrones numéricos plausibles de cada evolución se importan como Observation preliminares y se agrupan en un DiagnosticReport parcial; la narrativa completa se conserva una vez en la Composition y el DOCX, sin repetirse en cada resultado.\n` +
    `- Estudios, internación y vacunación se representan como DiagnosticReport, Encounter e Immunization respectivamente.\n` +
    `- El texto completo se conserva en Composition preliminar y el original, incluidas sus imágenes, en Binary + DocumentReference.\n` +
    `- El Binary se crea primero en el proyecto objetivo y luego se carga en el mismo ID; createDocumentReference() no se usa con superadmin porque el upload crudo heredaría inicialmente el proyecto principal del cliente.\n` +
    `- No se infieren sexo, códigos SNOMED/LOINC, unidades ausentes, vigencia de medicación ni certeza diagnóstica.\n\n` +
    `## Hallazgos del documento\n\n${
      preview.extraction.warnings.length
        ? preview.extraction.warnings.map((warning) => `- ${warning}`).join('\n')
        : '- Sin advertencias del parser.'
    }\n\n` +
    `## Lecciones operativas\n\n` +
    `- Medplum no permite buscar recursos Binary; su ID debe persistirse explícitamente en DocumentReference y en el resultado privado.\n` +
    `- Un PUT de contenido binario puede reemplazar meta.source; el importador lo restaura y vuelve a verificar el hash descargado.\n` +
    `- La dirección debe poblar address.line además de address.text para que la pantalla actual de OZRYN la muestre y edite.\n` +
    `- Coverage se relaciona con el paciente mediante beneficiary, no subject.\n\n` +
    `- Composition enlaza cada sección narrativa con los recursos estructurados derivados, de modo que se pueda volver del dato a su contexto fuente.\n\n` +
    `## Resultado\n\n${
      result
        ? Object.entries(counts).map(([key, count]) => `- ${key}: ${count}`).join('\n')
        : '- Pendiente de aplicación.'
    }\n\n` +
    `## Visibilidad esperada en OZRYN/Rendal\n\n` +
    `- Visible: resumen, historia clínica estructurada, parámetros de diálisis, evoluciones, seguimientos y documentos.\n` +
    `- La narrativa fuente se mantiene disponible junto con las vistas estructuradas.\n` +
    `- Edición clínica completa sigue pendiente: esta etapa prueba modelo y lectura, no un editor clínico definitivo.\n`
}

export async function preparePatientImport(input: {
  sourcePath: string
  outputRoot: string
  tenantSlug: string
  targetProjectId: string
  targetOrganizationId: string
}): Promise<{ preview: PatientImportPreview; directory: string }> {
  const sourcePath = path.resolve(input.sourcePath)
  const stat = await fs.stat(sourcePath)
  if (!stat.isFile() || path.extname(sourcePath).toLowerCase() !== '.docx') {
    throw new Error('The source must be an existing DOCX file.')
  }
  const bytes = await fs.readFile(sourcePath)
  const sourceHash = sha256(bytes)
  const parsed = await parseClinicalHistoryDocx(sourcePath)
  parsed.extraction.warnings.push(...parsed.conversionWarnings)
  const patientKey = patientKeyFor(parsed.extraction.patient.dni, sourcePath)
  const preview: PatientImportPreview = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    tenant: {
      slug: input.tenantSlug,
      targetProjectId: input.targetProjectId,
      targetOrganizationId: input.targetOrganizationId,
    },
    source: {
      absolutePath: sourcePath,
      filename: path.basename(sourcePath),
      mediaType: DOCX_MEDIA_TYPE,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: sourceHash,
      sha256Base64: createHash('sha256').update(bytes).digest('base64'),
    },
    patientKey,
    ozrynMrn: `REN-${patientKey.slice(0, 12).toUpperCase()}`,
    extraction: parsed.extraction,
    plannedResourceTypes: [...new Set([
      'Patient',
      ...(parsed.extraction.patient.coverageName ? ['Coverage'] : []),
      ...(parsed.extraction.structured.conditions.length ? ['Condition'] : []),
      ...(parsed.extraction.structured.procedures.length ? ['Procedure'] : []),
      ...(parsed.extraction.structured.medications.length ? ['MedicationStatement'] : []),
      ...(parsed.extraction.structured.encounters.length ? ['Encounter'] : []),
      ...(parsed.extraction.structured.diagnosticReports.length ? ['DiagnosticReport'] : []),
      ...(parsed.extraction.structured.observations.length ? ['Observation'] : []),
      ...(parsed.extraction.structured.immunizations.length ? ['Immunization'] : []),
      ...(Object.keys(parsed.extraction.dialysis).length ? ['QuestionnaireResponse', 'ServiceRequest'] : []),
      ...(Object.keys(parsed.extraction.dialysis).length ? ['CarePlan'] : []),
      'Composition',
      'Binary',
      'DocumentReference',
    ])],
    review: {
      approved: false,
      requiredChecks: [
        'Confirm patient name, DNI and birth date against the DOCX.',
        'Confirm the exact RENDAL Medplum project.',
        'Review all source-derived clinical resources before treating them as clinician-validated facts.',
      ],
    },
  }
  const directory = path.join(path.resolve(input.outputRoot), patientKey, sourceHash.slice(0, 16))
  await ensurePrivateDirectory(directory)
  await writePrivateJson(path.join(directory, 'preview.json'), preview)
  await writePrivateFile(path.join(directory, 'review.md'), reviewMarkdown(preview))
  await writePrivateFile(path.join(directory, 'experience.md'), experienceMarkdown(preview))
  return { preview, directory }
}

function assertLocalBaseUrl(baseUrl: string, allowNonLocal: boolean): void {
  const url = new URL(baseUrl)
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (!local && !allowNonLocal) {
    throw new Error('Refusing non-local Medplum. Pass --allow-nonlocal only after an explicit environment review.')
  }
}

function assertProject(resource: Resource, targetProjectId: string): void {
  if (resource.meta?.project !== targetProjectId) {
    throw new Error(
      `${resource.resourceType}/${resource.id ?? 'unknown'} belongs to ${resource.meta?.project ?? 'no project'}, expected ${targetProjectId}.`,
    )
  }
}

async function findByIdentifier<T extends Resource>(
  client: MedplumClient,
  resourceType: T['resourceType'],
  system: string,
  value: string,
  targetProjectId: string,
): Promise<T | undefined> {
  const matches = (await client.searchResources(resourceType, {
    identifier: `${system}|${value}`,
    _project: targetProjectId,
    _count: '2',
  })) as unknown as T[]
  if (matches.length > 1) {
    throw new Error(`Multiple ${resourceType} resources match ${system}|${value}.`)
  }
  const match = matches[0]
  if (match) assertProject(match, targetProjectId)
  return match
}

async function createOnce<T extends Resource>(
  client: MedplumClient,
  resource: T,
  system: string,
  value: string,
  targetProjectId: string,
): Promise<{ resource: T & { id: string }; action: 'created' | 'reused' }> {
  const existing = await findByIdentifier<T>(
    client,
    resource.resourceType,
    system,
    value,
    targetProjectId,
  )
  if (existing) {
    if (existing.meta?.source !== resource.meta?.source) {
      throw new Error(`${resource.resourceType}/${existing.id} has the same identifier but different provenance.`)
    }
    return { resource: existing as T & { id: string }, action: 'reused' }
  }
  const created = (await client.createResource(resource)) as T & { id: string }
  assertProject(created, targetProjectId)
  return { resource: created, action: 'created' }
}

function applied(
  resource: Resource & { id: string },
  action: 'created' | 'reused' | 'updated',
): AppliedResource {
  return {
    resourceType: resource.resourceType,
    id: resource.id,
    versionId: resource.meta?.versionId,
    action,
  }
}

function addSectionReference(
  entries: Record<string, string[]>,
  sectionKey: string,
  resource: Resource & { id: string },
): void {
  const reference = `${resource.resourceType}/${resource.id}`
  const sectionEntries = entries[sectionKey] ?? []
  if (!sectionEntries.includes(reference)) sectionEntries.push(reference)
  entries[sectionKey] = sectionEntries
}

async function applySourceResources(
  client: MedplumClient,
  templates: Array<ImportedResourceTemplate<Resource>>,
  targetProjectId: string,
  resources: AppliedResource[],
  entries: Record<string, string[]>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  const importedResources = await mapInBatches(templates, 12, async (template) => {
    const identifiers = (template.resource as Resource & {
      identifier?: Array<{ system?: string; value?: string }>
    }).identifier
    const identifier = identifiers?.find(
      (candidate) => candidate.system === SYSTEMS.rendalFact,
    )
    if (!identifier?.value) {
      throw new Error(`${template.resource.resourceType} source identifier is missing.`)
    }
    const imported = await createOnce(
      client,
      template.resource,
      SYSTEMS.rendalFact,
      identifier.value,
      targetProjectId,
    )
    return { template, imported }
  })
  for (const { template, imported } of importedResources) {
    resources.push(applied(imported.resource, imported.action))
    addSectionReference(entries, template.sectionKey, imported.resource)
    ids.set(template.key, imported.resource.id)
  }
  return ids
}

function sameReferences(
  left: Array<{ reference?: string }> | undefined,
  right: Array<{ reference?: string }> | undefined,
): boolean {
  return JSON.stringify((left ?? []).map((item) => item.reference).sort()) ===
    JSON.stringify((right ?? []).map((item) => item.reference).sort())
}

async function mapInBatches<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = []
  for (let index = 0; index < items.length; index += size) {
    output.push(...await Promise.all(items.slice(index, index + size).map(worker)))
  }
  return output
}

async function preflight(
  client: MedplumClient,
  preview: PatientImportPreview,
): Promise<void> {
  const project = await client.readResource('Project', preview.tenant.targetProjectId)
  if (project.id !== preview.tenant.targetProjectId) throw new Error('Target project preflight failed.')
  const organization = await client.readResource(
    'Organization',
    preview.tenant.targetOrganizationId,
  )
  assertProject(organization, preview.tenant.targetProjectId)
  const authenticatedProject = client.getProject()?.id
  if (!client.isSuperAdmin() && authenticatedProject !== preview.tenant.targetProjectId) {
    throw new Error('The authenticated client is neither superadmin nor scoped to the target project.')
  }
}

async function validatePreviewResources(
  client: MedplumClient,
  preview: PatientImportPreview,
): Promise<Array<{ resourceType: string; issueCount: number }>> {
  const patientId = '11111111-1111-4111-8111-111111111111'
  const compositionId = '22222222-2222-4222-8222-222222222222'
  const questionnaireResponseId = '33333333-3333-4333-8333-333333333333'
  const serviceRequestId = '44444444-4444-4444-8444-444444444444'
  const appliedAt = new Date().toISOString()
  const observationIds = new Map(
    preview.extraction.structured.observations.map((observation, index) => [
      observation.key,
      `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
    ]),
  )
  const candidates: Array<Resource | undefined> = [
    buildPatient(preview),
    buildCoverage(preview, patientId),
    ...buildConditionResources(preview, patientId).map((template) => template.resource),
    ...buildProcedureResources(preview, patientId).map((template) => template.resource),
    ...buildMedicationStatementResources(preview, patientId).map((template) => template.resource),
    ...buildEncounterResources(preview, patientId).map((template) => template.resource),
    ...buildImmunizationResources(preview, patientId).map((template) => template.resource),
    ...buildObservationResources(preview, patientId).map((template) => template.resource),
    ...buildDiagnosticReportResources(preview, patientId, observationIds).map(
      (template) => template.resource,
    ),
    buildDialysisQuestionnaireResponse(preview, patientId),
    buildDialysisServiceRequest(preview, patientId, questionnaireResponseId),
    buildCarePlan(preview, patientId, serviceRequestId, questionnaireResponseId),
    buildComposition(preview, patientId, appliedAt),
    {
      resourceType: 'Binary',
      meta: { project: preview.tenant.targetProjectId },
      contentType: preview.source.mediaType,
      securityContext: { reference: `Patient/${patientId}` },
    },
    buildDocumentReference(
      preview,
      patientId,
      compositionId,
      appliedAt,
      'Binary/33333333-3333-4333-8333-333333333333',
    ),
  ]
  const resources = candidates.filter((resource): resource is Resource => resource !== undefined)

  return mapInBatches(resources, 16, async (resource) => {
    const outcome = await client.validateResource(resource)
    const failures =
      outcome.issue?.filter((issue) => issue.severity === 'error' || issue.severity === 'fatal') ?? []
    if (failures.length) {
      const details = failures
        .map((issue) => issue.details?.text ?? issue.diagnostics ?? issue.code)
        .join('; ')
      throw new Error(`${resource.resourceType} failed Medplum validation: ${details}`)
    }
    return { resourceType: resource.resourceType, issueCount: outcome.issue?.length ?? 0 }
  })
}

async function authenticatedClient(
  allowNonLocal: boolean,
): Promise<MedplumClient> {
  const baseUrl = process.env.MEDPLUM_BASE_URL
  const clientId = process.env.MEDPLUM_PROVISIONING_CLIENT_ID
  const clientSecret = process.env.MEDPLUM_PROVISIONING_CLIENT_SECRET
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('MEDPLUM_BASE_URL and provisioning client credentials are required.')
  }
  assertLocalBaseUrl(baseUrl, allowNonLocal)
  const client = new MedplumClient({ baseUrl })
  await client.startClientLogin(clientId, clientSecret)
  return client
}

export async function validatePatientImport(input: {
  previewPath: string
  allowNonLocal: boolean
}): Promise<Array<{ resourceType: string; issueCount: number }>> {
  const preview = JSON.parse(
    await fs.readFile(path.resolve(input.previewPath), 'utf8'),
  ) as PatientImportPreview
  const client = await authenticatedClient(input.allowNonLocal)
  await preflight(client, preview)
  const resources = await validatePreviewResources(client, preview)
  await writePrivateJson(path.join(path.dirname(path.resolve(input.previewPath)), 'validation.json'), {
    validatedAt: new Date().toISOString(),
    targetProjectId: preview.tenant.targetProjectId,
    status: 'valid',
    resources,
  })
  return resources
}

export async function applyPatientImport(input: {
  previewPath: string
  approvalNote: string
  allowNonLocal: boolean
}): Promise<{ result: PatientImportResult; directory: string }> {
  const previewPath = path.resolve(input.previewPath)
  const directory = path.dirname(previewPath)
  const preview = JSON.parse(await fs.readFile(previewPath, 'utf8')) as PatientImportPreview
  if (preview.schemaVersion !== 1) throw new Error('Unsupported preview schema version.')
  if (!input.approvalNote.trim()) throw new Error('An approval note is required.')

  const currentBytes = await fs.readFile(preview.source.absolutePath)
  if (sha256(currentBytes) !== preview.source.sha256) {
    throw new Error('The source DOCX changed after prepare. Generate a new preview.')
  }

  const client = await authenticatedClient(input.allowNonLocal)
  await preflight(client, preview)
  await validatePreviewResources(client, preview)

  const resources: AppliedResource[] = []
  const compositionEntries: Record<string, string[]> = {}
  let patient = await findByIdentifier<Patient>(
    client,
    'Patient',
    SYSTEMS.rendalPatientKey,
    preview.patientKey,
    preview.tenant.targetProjectId,
  )
  if (!patient && preview.extraction.patient.dni) {
    const byDni = await findByIdentifier<Patient>(
      client,
      'Patient',
      SYSTEMS.arDni,
      preview.extraction.patient.dni,
      preview.tenant.targetProjectId,
    )
    if (byDni) {
      throw new Error(`Patient/${byDni.id} already has this DNI but no prepared RENDAL key; reconcile manually.`)
    }
  }
  let patientAction: 'created' | 'reused' | 'updated' = 'reused'
  if (!patient) {
    patient = await client.createResource(buildPatient(preview))
    assertProject(patient, preview.tenant.targetProjectId)
    patientAction = 'created'
  } else {
    const desiredPatient = buildPatient(preview)
    const existingDni = patient.identifier?.find(
      (identifier) => identifier.system === SYSTEMS.arDni,
    )?.value
    const desiredDni = preview.extraction.patient.dni
    if (existingDni && desiredDni && existingDni !== desiredDni) {
      throw new Error(`Patient/${patient.id} has a conflicting DNI.`)
    }
    if (
      patient.birthDate &&
      desiredPatient.birthDate &&
      patient.birthDate !== desiredPatient.birthDate
    ) {
      throw new Error(`Patient/${patient.id} has a conflicting birth date.`)
    }
    const existingAddress = patient.address?.[0]
    const desiredAddress = desiredPatient.address?.[0]
    const shouldUpdateAddress =
      desiredAddress?.text &&
      existingAddress?.text === desiredAddress.text &&
      !existingAddress.line?.length
    const shouldUpdateContact = Boolean(
      desiredPatient.contact?.length && !patient.contact?.length,
    )
    if (shouldUpdateAddress || shouldUpdateContact) {
      patient = await client.updateResource({
        ...patient,
        address: shouldUpdateAddress ? desiredPatient.address : patient.address,
        contact: shouldUpdateContact ? desiredPatient.contact : patient.contact,
      })
      assertProject(patient, preview.tenant.targetProjectId)
      patientAction = 'updated'
    }
  }
  if (!patient.id) throw new Error('Medplum returned a Patient without an ID.')
  resources.push(applied(patient as Patient & { id: string }, patientAction))

  const coverageTemplate = buildCoverage(preview, patient.id)
  if (coverageTemplate) {
    const value = coverageTemplate.identifier?.[0]?.value
    if (!value) throw new Error('Coverage import identifier is missing.')
    const imported = await createOnce<Coverage>(
      client,
      coverageTemplate,
      SYSTEMS.rendalCoverage,
      value,
      preview.tenant.targetProjectId,
    )
    let coverage = imported.resource
    let coverageAction: 'created' | 'reused' | 'updated' = imported.action
    if (
      imported.action === 'reused' &&
      (coverage.subscriberId !== coverageTemplate.subscriberId ||
        coverage.payor?.[0]?.display !== coverageTemplate.payor?.[0]?.display)
    ) {
      coverage = await client.updateResource({
        ...coverage,
        subscriberId: coverageTemplate.subscriberId,
        payor: coverageTemplate.payor,
      }) as Coverage & { id: string }
      assertProject(coverage, preview.tenant.targetProjectId)
      coverageAction = 'updated'
    }
    resources.push(applied(coverage, coverageAction))
    addSectionReference(compositionEntries, 'header', coverage)
  }

  const sourceTemplates = [
    ...buildConditionResources(preview, patient.id),
    ...buildProcedureResources(preview, patient.id),
    ...buildMedicationStatementResources(preview, patient.id),
    ...buildEncounterResources(preview, patient.id),
    ...buildImmunizationResources(preview, patient.id),
  ] as Array<ImportedResourceTemplate<Resource>>
  await applySourceResources(
    client,
    sourceTemplates,
    preview.tenant.targetProjectId,
    resources,
    compositionEntries,
  )

  const observationTemplates = buildObservationResources(
    preview,
    patient.id,
  ) as Array<ImportedResourceTemplate<Resource>>
  const observationIds = await applySourceResources(
    client,
    observationTemplates,
    preview.tenant.targetProjectId,
    resources,
    compositionEntries,
  )
  const reportTemplates = buildDiagnosticReportResources(
    preview,
    patient.id,
    observationIds,
  ) as Array<ImportedResourceTemplate<Resource>>
  await applySourceResources(
    client,
    reportTemplates,
    preview.tenant.targetProjectId,
    resources,
    compositionEntries,
  )

  const questionnaireTemplate = buildDialysisQuestionnaireResponse(preview, patient.id)
  let questionnaire: (QuestionnaireResponse & { id: string }) | undefined
  if (questionnaireTemplate) {
    const identifier = questionnaireTemplate.identifier
    if (!identifier?.value) throw new Error('QuestionnaireResponse import identifier is missing.')
    const imported = await createOnce<QuestionnaireResponse>(
      client,
      questionnaireTemplate,
      SYSTEMS.rendalQuestionnaireResponse,
      identifier.value,
      preview.tenant.targetProjectId,
    )
    questionnaire = imported.resource
    resources.push(applied(imported.resource, imported.action))
    addSectionReference(compositionEntries, 'dialysis', imported.resource)
  }

  const serviceRequestTemplate = questionnaire
    ? buildDialysisServiceRequest(preview, patient.id, questionnaire.id)
    : undefined
  let serviceRequest: (ServiceRequest & { id: string }) | undefined
  if (serviceRequestTemplate) {
    const value = serviceRequestTemplate.identifier?.[0]?.value
    if (!value) throw new Error('ServiceRequest import identifier is missing.')
    const imported = await createOnce<ServiceRequest>(
      client,
      serviceRequestTemplate,
      SYSTEMS.rendalServiceRequest,
      value,
      preview.tenant.targetProjectId,
    )
    serviceRequest = imported.resource
    resources.push(applied(imported.resource, imported.action))
    addSectionReference(compositionEntries, 'dialysis', imported.resource)
  }

  const carePlanTemplate = buildCarePlan(
    preview,
    patient.id,
    serviceRequest?.id,
    questionnaire?.id,
  )
  if (carePlanTemplate) {
    const value = carePlanTemplate.identifier?.[0]?.value
    if (!value) throw new Error('CarePlan import identifier is missing.')
    const imported = await createOnce<CarePlan>(
      client,
      carePlanTemplate,
      SYSTEMS.rendalCarePlan,
      value,
      preview.tenant.targetProjectId,
    )
    let carePlan = imported.resource
    let carePlanAction: 'created' | 'reused' | 'updated' = imported.action
    if (imported.action === 'reused') {
      const existingSupporting = carePlan.supportingInfo ?? []
      const desiredSupporting = carePlanTemplate.supportingInfo ?? []
      const existingActivities = carePlan.activity ?? []
      const desiredActivities = carePlanTemplate.activity ?? []
      const missingSupporting = desiredSupporting.filter(
        (candidate) => !existingSupporting.some(
          (existing) => existing.reference === candidate.reference,
        ),
      )
      const missingActivities = desiredActivities.filter(
        (candidate) => !existingActivities.some(
          (existing) => existing.reference?.reference === candidate.reference?.reference,
        ),
      )
      if (missingSupporting.length || missingActivities.length) {
        carePlan = await client.updateResource({
          ...carePlan,
          supportingInfo: [...existingSupporting, ...missingSupporting],
          activity: [...existingActivities, ...missingActivities],
        }) as CarePlan & { id: string }
        assertProject(carePlan, preview.tenant.targetProjectId)
        carePlanAction = 'updated'
      }
    }
    resources.push(applied(carePlan, carePlanAction))
    addSectionReference(compositionEntries, 'dialysis', carePlan)
  }

  const appliedAt = new Date().toISOString()
  const compositionTemplate = buildComposition(
    preview,
    patient.id,
    appliedAt,
    compositionEntries,
  )
  const importedComposition = await createOnce<Composition>(
      client,
      compositionTemplate,
      SYSTEMS.rendalComposition,
      preview.source.sha256,
      preview.tenant.targetProjectId,
    )
  let composition = importedComposition.resource
  let compositionAction: 'created' | 'reused' | 'updated' = importedComposition.action
  if (importedComposition.action === 'reused') {
    const desiredByTitle = new Map(
      (compositionTemplate.section ?? []).map((section) => [section.title, section]),
    )
    let changed = false
    const mergedSections = (composition.section ?? []).map((section) => {
      const desired = desiredByTitle.get(section.title)
      if (!desired || sameReferences(section.entry, desired.entry)) return section
      const merged = [...(section.entry ?? [])]
      for (const candidate of desired.entry ?? []) {
        if (!merged.some((existing) => existing.reference === candidate.reference)) {
          merged.push(candidate)
          changed = true
        }
      }
      return { ...section, entry: merged }
    })
    if (changed) {
      composition = await client.updateResource({
        ...composition,
        section: mergedSections,
      }) as Composition & { id: string }
      assertProject(composition, preview.tenant.targetProjectId)
      compositionAction = 'updated'
    }
  }
  resources.push(applied(composition, compositionAction))

  let documentReference = await findByIdentifier<DocumentReference>(
    client,
    'DocumentReference',
    SYSTEMS.rendalDocument,
    preview.source.sha256,
    preview.tenant.targetProjectId,
  )
  let binary: (Binary & { id: string }) | undefined
  if (documentReference) {
    if (
      documentReference.meta?.source !== `urn:sha256:${preview.source.sha256}` ||
      documentReference.content?.[0]?.attachment?.hash !== preview.source.sha256Base64 ||
      !documentReference.content?.[0]?.attachment?.url
    ) {
      throw new Error(`DocumentReference/${documentReference.id} is incomplete or has conflicting provenance.`)
    }
    const relatedBinary = documentReference.context?.related?.find((reference) =>
      reference.reference?.startsWith('Binary/'),
    )?.reference
    const binaryMatch = documentReference.content[0].attachment.url.match(/Binary\/([0-9a-f-]+)/i)
    let knownBinaryId = relatedBinary?.split('/')[1] ?? binaryMatch?.[1]
    let recoveredFromVerifiedResult = false
    if (!knownBinaryId) {
      try {
        const prior = JSON.parse(
          await fs.readFile(path.join(directory, 'apply-result.json'), 'utf8'),
        ) as PatientImportResult
        const priorDocument = prior.resources.find(
          (resource) => resource.resourceType === 'DocumentReference',
        )
        if (
          prior.sourceSha256 === preview.source.sha256 &&
          prior.tenant.targetProjectId === preview.tenant.targetProjectId &&
          prior.status === 'verified' &&
          priorDocument?.id === documentReference.id
        ) {
          knownBinaryId = prior.binaryId
          recoveredFromVerifiedResult = true
        }
      } catch {
        // A missing or invalid private result is handled by the explicit error below.
      }
    }
    if (knownBinaryId) {
      binary = await client.readResource('Binary', knownBinaryId)
    } else {
      throw new Error(
        `DocumentReference/${documentReference.id} has no Binary reference and the private verified result cannot recover it.`,
      )
    }
    assertProject(binary, preview.tenant.targetProjectId)
    const expectedSource = `urn:sha256:${preview.source.sha256}`
    let binaryAction: 'reused' | 'updated' = 'reused'
    if (!binary.meta?.source && recoveredFromVerifiedResult) {
      binary = await client.updateResource({
        ...binary,
        meta: { ...binary.meta, source: expectedSource },
      })
      assertProject(binary, preview.tenant.targetProjectId)
      binaryAction = 'updated'
    } else if (binary.meta?.source !== expectedSource) {
      throw new Error(`Binary/${binary.id} has conflicting provenance.`)
    }
    let documentAction: 'reused' | 'updated' = 'reused'
    if (!relatedBinary) {
      documentReference = await client.updateResource({
        ...documentReference,
        context: {
          ...documentReference.context,
          related: [
            ...(documentReference.context?.related ?? []),
            { reference: `Binary/${binary.id}` },
          ],
        },
      })
      assertProject(documentReference, preview.tenant.targetProjectId)
      documentAction = 'updated'
    }
    resources.push(applied(binary, binaryAction))
    resources.push(applied(documentReference as DocumentReference & { id: string }, documentAction))
  } else {
    const placeholder = await client.createResource(
      buildDocumentReference(preview, patient.id, composition.id, appliedAt),
    )
    assertProject(placeholder, preview.tenant.targetProjectId)
    binary = await client.createResource<Binary>({
      resourceType: 'Binary',
      meta: { project: preview.tenant.targetProjectId, source: `urn:sha256:${preview.source.sha256}` },
      contentType: preview.source.mediaType,
      securityContext: { reference: `DocumentReference/${placeholder.id}` },
    }) as Binary & { id: string }
    assertProject(binary, preview.tenant.targetProjectId)
    const binaryUrl = client.fhirUrl('Binary', binary.id)
    binaryUrl.searchParams.set('_filename', preview.source.filename)
    let uploaded = (await client.put(
      binaryUrl,
      currentBytes,
      preview.source.mediaType,
    )) as Binary & { id: string }
    assertProject(uploaded, preview.tenant.targetProjectId)
    if (uploaded.meta?.source !== `urn:sha256:${preview.source.sha256}`) {
      uploaded = await client.updateResource({
        ...uploaded,
        meta: { ...uploaded.meta, source: `urn:sha256:${preview.source.sha256}` },
      })
      assertProject(uploaded, preview.tenant.targetProjectId)
    }
    documentReference = await client.updateResource({
      ...buildDocumentReference(
        preview,
        patient.id,
        composition.id,
        appliedAt,
        uploaded.url ?? `Binary/${uploaded.id}`,
        uploaded.id,
      ),
      id: placeholder.id,
      meta: placeholder.meta,
    })
    assertProject(documentReference, preview.tenant.targetProjectId)
    binary = uploaded
    resources.push(applied(binary, 'created'))
    resources.push(applied(documentReference as DocumentReference & { id: string }, 'created'))
  }
  if (!documentReference?.id) throw new Error('DocumentReference has no ID after apply.')
  if (!binary?.id) {
    throw new Error('The existing document URL does not identify its Binary; manual verification is required.')
  }

  const result: PatientImportResult = {
    schemaVersion: 1,
    status: 'applied',
    appliedAt,
    tenant: preview.tenant,
    patientKey: preview.patientKey,
    sourceSha256: preview.source.sha256,
    patientId: patient.id,
    binaryId: binary.id,
    resources,
  }
  await writePrivateJson(path.join(directory, 'approval.json'), {
    approvedAt: appliedAt,
    approvalNote: input.approvalNote,
    sourceSha256: preview.source.sha256,
    targetProjectId: preview.tenant.targetProjectId,
  })
  await writePrivateJson(path.join(directory, 'apply-result.json'), result)
  await writePrivateJson(
    path.join(
      directory,
      'runs',
      `${appliedAt.replaceAll(':', '-').replaceAll('.', '-')}.json`,
    ),
    {
      approval: {
        approvedAt: appliedAt,
        approvalNote: input.approvalNote,
        sourceSha256: preview.source.sha256,
        targetProjectId: preview.tenant.targetProjectId,
      },
      result,
    },
  )
  await writePrivateFile(path.join(directory, 'experience.md'), experienceMarkdown(preview, result))
  return { result, directory }
}

export async function verifyPatientImport(input: {
  resultPath: string
  allowNonLocal: boolean
}): Promise<PatientImportResult> {
  const resultPath = path.resolve(input.resultPath)
  const directory = path.dirname(resultPath)
  const result = JSON.parse(await fs.readFile(resultPath, 'utf8')) as PatientImportResult
  const preview = JSON.parse(
    await fs.readFile(path.join(directory, 'preview.json'), 'utf8'),
  ) as PatientImportPreview
  const client = await authenticatedClient(input.allowNonLocal)
  await preflight(client, preview)

  for (const entry of result.resources) {
    const resource = await client.readResource(entry.resourceType as ResourceType, entry.id)
    assertProject(resource, result.tenant.targetProjectId)
  }
  const document = await findByIdentifier<DocumentReference>(
    client,
    'DocumentReference',
    SYSTEMS.rendalDocument,
    result.sourceSha256,
    result.tenant.targetProjectId,
  )
  if (!document || document.subject?.reference !== `Patient/${result.patientId}`) {
    throw new Error('DocumentReference verification failed.')
  }
  const blob = await client.download(`Binary/${result.binaryId}`)
  const downloadedHash = sha256(new Uint8Array(await blob.arrayBuffer()))
  if (downloadedHash !== result.sourceSha256) throw new Error('Downloaded Binary hash does not match the source.')

  const verified: PatientImportResult = {
    ...result,
    status: 'verified',
    verifiedAt: new Date().toISOString(),
  }
  await writePrivateJson(resultPath, verified)
  await writePrivateFile(path.join(directory, 'experience.md'), experienceMarkdown(preview, verified))
  return verified
}
