import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) {
    return null
  }

  const basePath = path.join(process.cwd(), 'src', specifier.slice(2))
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ]

  const match = candidates.find((candidate) => fs.existsSync(candidate))
  return match ? pathToFileURL(match).href : null
}

export async function resolve(specifier, context, defaultResolve) {
  const aliasMatch = resolveAlias(specifier)
  if (aliasMatch) {
    return defaultResolve(aliasMatch, context, defaultResolve)
  }

  return defaultResolve(specifier, context, defaultResolve)
}
