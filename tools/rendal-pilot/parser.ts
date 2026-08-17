import path from 'node:path'

import mammoth from 'mammoth'

import type {
  ClinicalSection,
  ExtractedClinicalHistory,
} from './types'
import { extractStructuredHistory } from './structured-extraction'

const SECTION_TITLES = new Map<string, { key: string; title: string }>([
  ['ANTECEDENTES PERSONALES', { key: 'personal-history', title: 'Antecedentes personales' }],
  [
    'ANTECEDENTES DE ENFERMEDAD ACTUAL',
    { key: 'current-illness', title: 'Antecedentes de enfermedad actual' },
  ],
  ['INTERNACIONES', { key: 'admissions', title: 'Internaciones' }],
  [
    'ESTUDIOS COMPLEMENTARIOS',
    { key: 'complementary-studies', title: 'Estudios complementarios' },
  ],
  ['VACUNACION', { key: 'vaccination', title: 'Vacunación' }],
  [
    'TRATAMIENTO AL INGRESO',
    { key: 'admission-treatment', title: 'Tratamiento al ingreso' },
  ],
  ['MODALIDAD DIALITICA', { key: 'dialysis', title: 'Modalidad dialítica' }],
])

function clean(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function canonical(value: string): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function findField(lines: string[], labels: string[]): string | undefined {
  const wanted = new Set(labels.map(canonical))
  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    if (wanted.has(canonical(line.slice(0, separator)))) {
      return clean(line.slice(separator + 1)) || undefined
    }
  }
  return undefined
}

function onlyDigits(value: string | undefined): string | undefined {
  if (!value) return undefined
  const digits = value.replace(/\D/g, '')
  return digits || undefined
}

function parseDate(
  value: string | undefined,
  declaredAge: number | undefined,
  anchorYear: number,
): { date?: string; inferredCentury: boolean } {
  const match = value?.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/)
  if (!match) return { inferredCentury: false }

  const day = Number(match[1])
  const month = Number(match[2])
  const rawYear = Number(match[3])
  const candidates =
    match[3].length === 4
      ? [rawYear]
      : [1900 + rawYear, 2000 + rawYear].filter(
          (candidate) => candidate <= anchorYear && anchorYear - candidate <= 120,
        )

  if (!candidates.length || month < 1 || month > 12 || day < 1 || day > 31) {
    return { inferredCentury: false }
  }

  const year = candidates.sort((left, right) => {
    if (declaredAge === undefined) return right - left
    return (
      Math.abs(anchorYear - left - declaredAge) -
      Math.abs(anchorYear - right - declaredAge)
    )
  })[0]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { inferredCentury: false }
  }

  return {
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    inferredCentury: match[3].length === 2,
  }
}

function getMaxClinicalYear(lines: string[]): number {
  const years = lines
    .flatMap((line) => canonical(line).match(/20\d{2}/g) ?? [])
    .map(Number)
    .filter((year) => year <= new Date().getFullYear() + 1)
  return years.length ? Math.max(...years) : new Date().getFullYear()
}

function splitName(fullName: string, sourcePath: string): {
  familyName: string
  givenNames: string[]
  matchedFolder: boolean
} {
  const folderName = clean(path.basename(path.dirname(sourcePath)))
  const folderWords = folderName.split(/\s+/).filter(Boolean)
  const fullWords = clean(fullName).split(/\s+/).filter(Boolean)
  const matchedFolder =
    folderWords.length > 0 &&
    canonical(fullWords.slice(0, folderWords.length).join(' ')) === canonical(folderName)

  if (matchedFolder && fullWords.length > folderWords.length) {
    return {
      familyName: fullWords.slice(0, folderWords.length).join(' '),
      givenNames: fullWords.slice(folderWords.length),
      matchedFolder,
    }
  }

  return {
    familyName: fullWords[0] ?? fullName,
    givenNames: fullWords.slice(1),
    matchedFolder,
  }
}

function buildSections(lines: string[]): ClinicalSection[] {
  const firstHeading = lines.findIndex((line) => SECTION_TITLES.has(canonical(line)))
  const sections: ClinicalSection[] = [
    {
      key: 'header',
      title: 'Datos de cabecera',
      lines: lines.slice(0, firstHeading >= 0 ? firstHeading : lines.length),
    },
  ]

  let current: ClinicalSection | undefined
  for (const line of lines.slice(firstHeading >= 0 ? firstHeading : lines.length)) {
    const normalized = canonical(line).replace(/^EVOLUCIONES\s*(20\d{2})$/, 'EVOLUCIONES $1')
    const heading = SECTION_TITLES.get(normalized)
    const evolution = normalized.match(/^EVOLUCIONES (20\d{2})$/)
    if (heading || evolution) {
      current = {
        key: heading?.key ?? 'evolutions',
        title: heading?.title ?? `Evoluciones ${evolution?.[1]}`,
        lines: [],
      }
      sections.push(current)
      continue
    }
    current?.lines.push(line)
  }

  return sections.filter((section) => section.lines.length > 0)
}

function parseDialysis(section: ClinicalSection | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of section?.lines ?? []) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const label = clean(line.slice(0, separator))
    const value = clean(line.slice(separator + 1))
    if (label && value) result[label] = value
  }
  return result
}

export function parseClinicalHistoryText(
  rawText: string,
  sourcePath: string,
): ExtractedClinicalHistory {
  const lines = rawText.split(/\r?\n/).map(clean).filter(Boolean)
  if (lines.length < 2) throw new Error('The DOCX does not contain enough text to parse.')

  const warnings: string[] = []
  const fullName = lines[0]
  const name = splitName(fullName, sourcePath)
  if (!name.matchedFolder) {
    warnings.push('The patient folder did not match the beginning of the document name; review name splitting.')
  }

  const ageText = findField(lines, ['EDAD'])
  const declaredAge = ageText?.match(/\d{1,3}/)?.[0]
  const age = declaredAge ? Number(declaredAge) : undefined
  const anchorYear = getMaxClinicalYear(lines)
  const birth = parseDate(findField(lines, ['FECHA DE NACIMIENTO']), age, anchorYear)
  if (birth.inferredCentury) {
    warnings.push('The birth-date century was inferred from the two-digit source year and declared age.')
  }
  if (birth.date && age !== undefined) {
    const ageAtAnchorYearEnd = anchorYear - Number(birth.date.slice(0, 4))
    if (Math.abs(ageAtAnchorYearEnd - age) > 1) {
      warnings.push(
        'The declared age is stale or inconsistent with the birth date and latest clinical year; birthDate is preserved but age is not imported.',
      )
    }
  }

  const dniLine = findField(lines, ['DNI'])
  const dni = onlyDigits(dniLine?.split(/\bCUIL\s*:/i)[0])
  const cuil = onlyDigits(dniLine?.match(/\bCUIL\s*:\s*([\d-]+)/i)?.[1])
  const coverageLine = findField(lines, ['OOSS', 'OBRA SOCIAL'])
  const coverageSeparator = coverageLine?.lastIndexOf(':') ?? -1
  const coverageNameWithLabel =
    coverageLine && coverageSeparator >= 0
      ? clean(coverageLine.slice(0, coverageSeparator))
      : coverageLine
  const coverageName = coverageNameWithLabel
    ?.replace(/\s*N[ÚU]MERO\s+DE\s+AFILIADO$/i, '')
    .trim()
  const coverageMemberId =
    coverageLine && coverageSeparator >= 0
      ? clean(coverageLine.slice(coverageSeparator + 1))
      : undefined
  const contactText = findField(lines, ['CONTACTO', 'TELEFONO', 'TELÉFONO'])
  const phoneDigits = onlyDigits(contactText)
  const phone = phoneDigits && phoneDigits.length >= 7 ? phoneDigits : undefined
  const emailValue = findField(lines, ['EMAIL', 'E-MAIL'])
  const email = emailValue?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  const firstDialysis = parseDate(
    findField(lines, ['PRIMERA DIALISIS VIDA DEL PACIENTE', 'PRIMERA DIÁLISIS VIDA DEL PACIENTE']),
    undefined,
    anchorYear,
  )
  if (firstDialysis.inferredCentury) {
    warnings.push('The first-dialysis century was inferred from the clinical-history year range.')
  }

  if (!dni) warnings.push('No DNI could be extracted; the patient requires manual identity review.')
  if (!birth.date) warnings.push('No complete birth date could be extracted.')
  if (!email) warnings.push('No valid email could be extracted.')
  if (!phone && contactText) {
    warnings.push('The contact field contains no unambiguous phone number and was not mapped to Patient.telecom.')
  }

  const sections = buildSections(lines)
  const structured = extractStructuredHistory(sections, anchorYear, warnings)
  return {
    patient: {
      fullName,
      familyName: name.familyName,
      givenNames: name.givenNames,
      birthDate: birth.date,
      declaredAge: age,
      dni,
      cuil,
      coverageName,
      coverageMemberId,
      addressText: findField(lines, ['DOMICILIO']),
      phone,
      contactText,
      email,
    },
    renalEtiology: findField(lines, ['ETIOLOGIA DE LA IRC', 'ETIOLOGÍA DE LA IRC']),
    firstDialysisDate: firstDialysis.date,
    dialysis: parseDialysis(sections.find((section) => section.key === 'dialysis')),
    sections,
    structured,
    warnings,
  }
}

export async function parseClinicalHistoryDocx(
  sourcePath: string,
): Promise<{ extraction: ExtractedClinicalHistory; conversionWarnings: string[] }> {
  const result = await mammoth.extractRawText({ path: sourcePath })
  return {
    extraction: parseClinicalHistoryText(result.value, sourcePath),
    conversionWarnings: result.messages.map((message) => `${message.type}: ${message.message}`),
  }
}
