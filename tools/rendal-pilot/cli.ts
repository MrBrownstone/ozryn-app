import path from 'node:path'

import {
  applyPatientImport,
  preparePatientImport,
  validatePatientImport,
  verifyPatientImport,
} from './pilot'

function parseArgs(values: string[]): { command?: string; flags: Map<string, string | true> } {
  const [command, ...rest] = values
  const flags = new Map<string, string | true>()
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`)
    const key = token.slice(2)
    const next = rest[index + 1]
    if (!next || next.startsWith('--')) flags.set(key, true)
    else {
      flags.set(key, next)
      index += 1
    }
  }
  return { command, flags }
}

function required(flags: Map<string, string | true>, name: string): string {
  const value = flags.get(name)
  if (!value || value === true) throw new Error(`--${name} is required.`)
  return value
}

function usage(): never {
  throw new Error(
    'Usage: rendal:pilot prepare --source <docx> --tenant <slug> --target-project <uuid> --target-organization <uuid> [--output-root <dir>] | validate --preview <preview.json> | apply --preview <preview.json> --yes --approval-note <text> | verify --result <apply-result.json>',
  )
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2))
  if (command === 'prepare') {
    const outputRoot =
      typeof flags.get('output-root') === 'string'
        ? String(flags.get('output-root'))
        : path.resolve(process.cwd(), '../.tmp/RENDAL-PILOT')
    const prepared = await preparePatientImport({
      sourcePath: required(flags, 'source'),
      outputRoot,
      tenantSlug: required(flags, 'tenant'),
      targetProjectId: required(flags, 'target-project'),
      targetOrganizationId: required(flags, 'target-organization'),
    })
    console.log(
      JSON.stringify(
        {
          status: 'prepared',
          patientKey: prepared.preview.patientKey,
          sourceSha256: prepared.preview.source.sha256,
          plannedResourceTypes: prepared.preview.plannedResourceTypes,
          warningCount: prepared.preview.extraction.warnings.length,
          previewPath: path.join(prepared.directory, 'preview.json'),
          reviewPath: path.join(prepared.directory, 'review.md'),
        },
        null,
        2,
      ),
    )
    return
  }
  if (command === 'validate') {
    const resources = await validatePatientImport({
      previewPath: required(flags, 'preview'),
      allowNonLocal: flags.has('allow-nonlocal'),
    })
    console.log(JSON.stringify({ status: 'valid', resources }, null, 2))
    return
  }
  if (command === 'apply') {
    if (!flags.has('yes')) throw new Error('Apply requires --yes after reviewing review.md.')
    const applied = await applyPatientImport({
      previewPath: required(flags, 'preview'),
      approvalNote: required(flags, 'approval-note'),
      allowNonLocal: flags.has('allow-nonlocal'),
    })
    console.log(
      JSON.stringify(
        {
          status: applied.result.status,
          patientId: applied.result.patientId,
          targetProjectId: applied.result.tenant.targetProjectId,
          resources: applied.result.resources,
          resultPath: path.join(applied.directory, 'apply-result.json'),
        },
        null,
        2,
      ),
    )
    return
  }
  if (command === 'verify') {
    const verified = await verifyPatientImport({
      resultPath: required(flags, 'result'),
      allowNonLocal: flags.has('allow-nonlocal'),
    })
    console.log(
      JSON.stringify(
        {
          status: verified.status,
          patientId: verified.patientId,
          targetProjectId: verified.tenant.targetProjectId,
          resourceCount: verified.resources.length,
          binarySha256Verified: true,
        },
        null,
        2,
      ),
    )
    return
  }
  usage()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
