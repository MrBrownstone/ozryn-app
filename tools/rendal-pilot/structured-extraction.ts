import type {
  ClinicalSection,
  ExtractedCondition,
  ExtractedDiagnosticReport,
  ExtractedEncounter,
  ExtractedEvolution,
  ExtractedImmunization,
  ExtractedMedication,
  ExtractedObservation,
  ExtractedProcedure,
  ExtractedStructuredHistory,
} from './types'

const MONTHS = new Map<string, number>([
  ['ENERO', 1],
  ['FEBRERO', 2],
  ['MARZO', 3],
  ['ABRIL', 4],
  ['MAYO', 5],
  ['JUNIO', 6],
  ['JULIO', 7],
  ['AGOSTO', 8],
  ['SETIEMBRE', 9],
  ['SEPTIEMBRE', 9],
  ['OCTUBRE', 10],
  ['NOVIEMBRE', 11],
  ['DICIEMBRE', 12],
])

const OBSERVATION_LIMITS: Record<string, { min: number; max: number }> = {
  hematocrit: { min: 0, max: 100 },
  hemoglobin: { min: 0, max: 30 },
  calcium: { min: 0, max: 20 },
  phosphorus: { min: 0, max: 20 },
  'urea-pre': { min: 0, max: 500 },
  'urea-post': { min: 0, max: 500 },
  creatinine: { min: 0, max: 30 },
  sodium: { min: 100, max: 200 },
  potassium: { min: 1, max: 10 },
  albumin: { min: 0, max: 10 },
  ferritin: { min: 0, max: 5000 },
  iron: { min: 0, max: 1000 },
  'transferrin-saturation': { min: 0, max: 100 },
  pth: { min: 0, max: 5000 },
  'vitamin-d': { min: 0, max: 500 },
}

function clean(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function canonical(value: string): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function slug(value: string): string {
  return canonical(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function section(sections: ClinicalSection[], key: string): ClinicalSection | undefined {
  return sections.find((candidate) => candidate.key === key)
}

function sourceDate(value: string, anchorYear: number): string | undefined {
  const match = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/)
  if (!match) return undefined
  const day = Number(match[1])
  const month = Number(match[2])
  const shortYear = Number(match[3])
  const year = match[3].length === 4
    ? shortYear
    : 2000 + shortYear <= anchorYear + 1
      ? 2000 + shortYear
      : 1900 + shortYear
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function monthPeriod(year: number, month: number): { start: string; end: string } {
  const end = new Date(Date.UTC(year, month, 0))
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`,
  }
}

function extractConditions(
  sections: ClinicalSection[],
  anchorYear: number,
): ExtractedCondition[] {
  const lines = section(sections, 'personal-history')?.lines ?? []
  const result: ExtractedCondition[] = []
  for (const line of lines) {
    const normalized = canonical(line)
    const onsetDate = sourceDate(line, anchorYear)
    if (normalized.includes('IRC SIN CONTROLES')) {
      result.push({
        key: 'chronic-kidney-disease',
        display: 'Insuficiencia renal crónica',
        sourceText: line,
        onsetDate,
      })
    }
    if (normalized.includes('CARCINOMA CELS CLARAS')) {
      result.push({
        key: 'clear-cell-carcinoma',
        display: 'Carcinoma de células claras',
        sourceText: line,
        onsetDate,
      })
    }
    if (normalized.includes('NEFRITIS CRONICA LEVE')) {
      result.push({
        key: 'chronic-nephritis',
        display: 'Nefritis crónica leve',
        sourceText: line,
        onsetDate,
      })
    }
    if (/^DBT\s*2\b/.test(normalized)) {
      result.push({
        key: 'type-2-diabetes',
        display: 'Diabetes mellitus tipo 2 insulinorrequiriente',
        sourceText: line,
        onsetAge: Number(line.match(/\b(\d{1,3})\s*años/i)?.[1]) || undefined,
      })
    }
    if (/^HTA\b/.test(normalized)) {
      result.push({
        key: 'hypertension',
        display: 'Hipertensión arterial',
        sourceText: line,
        onsetAge: Number(line.match(/\b(\d{1,3})\s*años/i)?.[1]) || undefined,
      })
    }
    if (normalized.includes('DIVERTICULOSIS')) {
      result.push({
        key: 'diverticulosis',
        display: 'Diverticulosis',
        sourceText: line,
      })
    }
  }

  const currentIllness = section(sections, 'current-illness')?.lines ?? []
  for (const line of currentIllness) {
    if (canonical(line).includes('IRCT')) {
      result.push({
        key: 'end-stage-kidney-disease',
        display: clean(line.split(':')[0]),
        sourceText: line,
      })
    }
  }
  return result
}

function extractEncounter(sections: ClinicalSection[]): ExtractedEncounter[] {
  const lines = section(sections, 'admissions')?.lines ?? []
  const firstLine = lines[0]
  const dates = firstLine?.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s+AL\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i)
  if (!dates) return []
  const start = sourceDate(dates[1], 2026)
  const end = sourceDate(dates[2], 2026)
  if (!start || !end) return []
  return [{
    key: `inpatient-${start}`,
    display: 'Internación por insuficiencia renal con criterios de diálisis',
    period: { start, end },
    sourceText: lines.join('\n'),
  }]
}

function extractProcedures(
  sections: ClinicalSection[],
  anchorYear: number,
  encounters: ExtractedEncounter[],
): ExtractedProcedure[] {
  const result: ExtractedProcedure[] = []
  for (const line of section(sections, 'personal-history')?.lines ?? []) {
    const normalized = canonical(line)
    const performedDate = sourceDate(line, anchorYear)
    if (normalized.includes('CONFECCION AV AUTOLOGA')) {
      result.push({
        key: 'autologous-av-access-creation',
        display: 'Confección de acceso vascular autólogo radiocefálico izquierdo',
        sourceText: line,
        performedDate,
      })
    }
    if (normalized.includes('NEFRECTOMIA IZQ')) {
      result.push({
        key: 'left-nephrectomy',
        display: 'Nefrectomía izquierda',
        sourceText: line,
        performedDate,
      })
    }
  }

  const admissions = section(sections, 'admissions')?.lines ?? []
  const admissionPeriod = encounters[0]?.period
  const admissionText = admissions.join('\n')
  if (canonical(admissionText).includes('CATETER YUGULAR DERECHO PARA HD')) {
    result.push({
      key: 'right-jugular-hemodialysis-catheter',
      display: 'Colocación de catéter yugular derecho para hemodiálisis',
      sourceText: admissionText,
      performedPeriod: admissionPeriod,
    })
  }
  if (canonical(admissionText).includes('CISTOSCOPIA FLEX')) {
    result.push({
      key: 'flexible-cystoscopy-urinary-catheter',
      display: 'Cistoscopia flexible y colocación de sonda vesical',
      sourceText: admissionText,
      performedPeriod: admissionPeriod,
    })
  }
  return result
}

function extractMedications(sections: ClinicalSection[]): ExtractedMedication[] {
  const lines = section(sections, 'admission-treatment')?.lines ?? []
  const result: ExtractedMedication[] = []
  for (const line of lines) {
    const candidates = [
      { name: 'Insulina NPH', next: 'Enalapril' },
      { name: 'Enalapril' },
      { name: 'Omeprazol' },
      { name: 'Tamsulosina' },
    ]
    for (const candidate of candidates) {
      const pattern = candidate.next
        ? new RegExp(`${candidate.name}\\s+(.+?)(?=\\s+${candidate.next}\\b)`, 'i')
        : new RegExp(`${candidate.name}\\s+(.+)$`, 'i')
      const match = line.match(pattern)
      if (!match) continue
      result.push({
        key: slug(candidate.name),
        display: candidate.name,
        dosageText: clean(match[1]),
        sourceText: line,
      })
    }
  }
  return result
}

function extractImagingReports(
  sections: ClinicalSection[],
  anchorYear: number,
): ExtractedDiagnosticReport[] {
  const lines = section(sections, 'complementary-studies')?.lines ?? []
  const groups: Array<{ date: string; lines: string[] }> = []
  for (const line of lines) {
    const date = sourceDate(line, anchorYear)
    if (date && /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(line)) {
      groups.push({ date, lines: [clean(line.replace(/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*[–.-]?\s*/, ''))] })
      continue
    }
    groups.at(-1)?.lines.push(line)
  }

  return groups.map((group) => {
    const sourceText = group.lines.filter(Boolean).join(' ')
    const normalized = canonical(sourceText)
    const display = normalized.includes('PET CT')
      ? 'PET/CT'
      : normalized.includes('ECOGRAFIA RENAL')
        ? 'Ecografía renal'
        : normalized.includes('TAC ABDOMINO')
          ? 'TAC abdominopélvica'
          : 'Estudio complementario'
    return {
      key: `imaging-${group.date}-${slug(display)}`,
      sectionKey: 'complementary-studies',
      display,
      sourceText,
      effectiveDate: group.date,
      status: 'partial',
      observationKeys: [],
    }
  })
}

function extractEvolutions(sections: ClinicalSection[]): ExtractedEvolution[] {
  const evolutionSections = sections.filter((candidate) => candidate.key === 'evolutions')
  const result: ExtractedEvolution[] = []
  for (const evolutionSection of evolutionSections) {
    let year = Number(evolutionSection.title.match(/20\d{2}/)?.[0]) || new Date().getFullYear()
    let current: ExtractedEvolution | undefined
    for (const line of evolutionSection.lines) {
      if (/^20\d{2}$/.test(clean(line))) {
        year = Number(clean(line))
        current = undefined
        continue
      }

      const monthMatch = canonical(line).match(
        /^(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SETIEMBRE|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b\s*[–-]?\s*(.*)$/,
      )
      if (monthMatch) {
        const month = MONTHS.get(monthMatch[1])
        if (!month) continue
        const sourceText = clean(line.replace(/^\S+\s*[–-]?\s*/, ''))
        current = {
          key: `evolution-${year}-${String(month).padStart(2, '0')}`,
          year,
          month,
          display: `${monthMatch[1][0]}${monthMatch[1].slice(1).toLowerCase()} ${year}`,
          period: monthPeriod(year, month),
          sourceText,
        }
        result.push(current)
        continue
      }
      if (current) {
        current.sourceText = clean(`${current.sourceText} ${line}`)
      }
    }
  }
  return result.filter((evolution) => evolution.sourceText)
}

function collectMatches(
  text: string,
  pattern: RegExp,
  callback: (match: RegExpExecArray, matchIndex: number) => Array<{
    code: string
    display: string
    value: number
    unit?: string
  }>,
): Array<{ code: string; display: string; value: number; unit?: string; index: number }> {
  const result: Array<{ code: string; display: string; value: number; unit?: string; index: number }> = []
  let match: RegExpExecArray | null
  let matchIndex = 0
  pattern.lastIndex = 0
  while ((match = pattern.exec(text))) {
    for (const item of callback(match, matchIndex)) result.push({ ...item, index: matchIndex })
    matchIndex += 1
  }
  return result
}

function plausible(code: string, value: number): boolean {
  const limit = OBSERVATION_LIMITS[code]
  return Number.isFinite(value) && (!limit || (value >= limit.min && value <= limit.max))
}

function extractEvolutionObservations(
  evolution: ExtractedEvolution,
  warnings: string[],
): ExtractedObservation[] {
  const text = evolution.sourceText
  const candidates = [
    ...collectMatches(text, /Hto(?:\s*\/\s*Hb)?\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:\/|\s+Hb\s*)\s*(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'hematocrit', display: 'Hematocrito', value: Number(match[1].replace(',', '.')) },
      { code: 'hemoglobin', display: 'Hemoglobina', value: Number(match[2].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Ca\s*\/\s*P\s*:?\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'calcium', display: 'Calcio', value: Number(match[1].replace(',', '.')) },
      { code: 'phosphorus', display: 'Fósforo', value: Number(match[2].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Ca\s+(\d+(?:[.,]\d+)?)\s+P\s+(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'calcium', display: 'Calcio', value: Number(match[1].replace(',', '.')) },
      { code: 'phosphorus', display: 'Fósforo', value: Number(match[2].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Urea\s+pre(?:\s*[-/]?\s*post)?\s*:?\s*(\d+(?:[.,]\d+)?)\s*[-/]\s*(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'urea-pre', display: 'Urea prediálisis', value: Number(match[1].replace(',', '.')) },
      { code: 'urea-post', display: 'Urea posdiálisis', value: Number(match[2].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Creatinina\s+(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'creatinine', display: 'Creatinina', value: Number(match[1].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Iono\s+(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'sodium', display: 'Sodio', value: Number(match[1].replace(',', '.')) },
      { code: 'potassium', display: 'Potasio', value: Number(match[2].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Alb\s+(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'albumin', display: 'Albúmina', value: Number(match[1].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Ferritina\s+(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'ferritin', display: 'Ferritina', value: Number(match[1].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Ferremia\s+(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'iron', display: 'Ferremia', value: Number(match[1].replace(',', '.')) },
    ]),
    ...collectMatches(text, /\bSat\s+(\d+(?:[.,]\d+)?)\s*%/gi, (match) => [
      { code: 'transferrin-saturation', display: 'Saturación de transferrina', value: Number(match[1].replace(',', '.')), unit: '%' },
    ]),
    ...collectMatches(text, /PTH\s+(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'pth', display: 'Hormona paratiroidea', value: Number(match[1].replace(',', '.')) },
    ]),
    ...collectMatches(text, /Vit(?:amina)?\s*D\s+(\d+(?:[.,]\d+)?)/gi, (match) => [
      { code: 'vitamin-d', display: 'Vitamina D', value: Number(match[1].replace(',', '.')) },
    ]),
  ]

  const counters = new Map<string, number>()
  const result: ExtractedObservation[] = []
  for (const candidate of candidates) {
    if (!plausible(candidate.code, candidate.value)) {
      warnings.push(
        `Skipped implausible ${candidate.display} value ${candidate.value} in ${evolution.display}; the original narrative remains preserved.`,
      )
      continue
    }
    const occurrence = (counters.get(candidate.code) ?? 0) + 1
    counters.set(candidate.code, occurrence)
    result.push({
      key: `${evolution.key}-${candidate.code}-${occurrence}`,
      reportKey: evolution.key,
      code: candidate.code,
      display: candidate.display,
      value: candidate.value,
      unit: candidate.unit,
      effectivePeriod: evolution.period,
      sourceText: evolution.sourceText,
    })
  }
  return result
}

export function extractStructuredHistory(
  sections: ClinicalSection[],
  anchorYear: number,
  warnings: string[],
): ExtractedStructuredHistory {
  const encounters = extractEncounter(sections)
  const evolutions = extractEvolutions(sections)
  const observations = evolutions.flatMap((evolution) =>
    extractEvolutionObservations(evolution, warnings),
  )
  const reports: ExtractedDiagnosticReport[] = [
    ...extractImagingReports(sections, anchorYear),
    ...evolutions
      .map((evolution) => ({
        evolution,
        observationKeys: observations
          .filter((observation) => observation.reportKey === evolution.key)
          .map((observation) => observation.key),
      }))
      .filter(({ observationKeys }) => observationKeys.length > 0)
      .map(({ evolution, observationKeys }) => ({
        key: evolution.key,
        sectionKey: 'evolutions',
        display: `Resultados de laboratorio extraídos — ${evolution.display}`,
        sourceText: evolution.sourceText,
        effectivePeriod: evolution.period,
        status: 'partial' as const,
        observationKeys,
      })),
  ]
  const vaccinationLines = section(sections, 'vaccination')?.lines ?? []
  const immunizations: ExtractedImmunization[] = vaccinationLines.map((line, index) => ({
    key: `vaccination-${index + 1}-${slug(line)}`,
    display: canonical(line).includes('ANTI HBV')
      ? 'Vacuna contra hepatitis B'
      : line,
    occurrenceText: 'Fecha no consignada en el documento fuente',
    sourceText: line,
  }))

  return {
    conditions: extractConditions(sections, anchorYear),
    procedures: extractProcedures(sections, anchorYear, encounters),
    medications: extractMedications(sections),
    encounters,
    diagnosticReports: reports,
    observations,
    immunizations,
    evolutions,
  }
}
