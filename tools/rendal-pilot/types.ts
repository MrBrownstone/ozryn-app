export interface ClinicalSection {
  key: string
  title: string
  lines: string[]
}

export interface ExtractedCondition {
  key: string
  display: string
  sourceText: string
  onsetDate?: string
  onsetAge?: number
}

export interface ExtractedProcedure {
  key: string
  display: string
  sourceText: string
  performedDate?: string
  performedPeriod?: {
    start: string
    end: string
  }
}

export interface ExtractedMedication {
  key: string
  display: string
  dosageText: string
  sourceText: string
}

export interface ExtractedEncounter {
  key: string
  display: string
  period: {
    start: string
    end: string
  }
  sourceText: string
}

export interface ExtractedDiagnosticReport {
  key: string
  sectionKey: string
  display: string
  sourceText: string
  effectiveDate?: string
  effectivePeriod?: {
    start: string
    end: string
  }
  status: 'partial'
  observationKeys: string[]
}

export interface ExtractedObservation {
  key: string
  reportKey: string
  code: string
  display: string
  value: number
  unit?: string
  effectivePeriod: {
    start: string
    end: string
  }
  sourceText: string
}

export interface ExtractedImmunization {
  key: string
  display: string
  occurrenceText: string
  sourceText: string
}

export interface ExtractedEvolution {
  key: string
  year: number
  month: number
  display: string
  period: {
    start: string
    end: string
  }
  sourceText: string
}

export interface ExtractedStructuredHistory {
  conditions: ExtractedCondition[]
  procedures: ExtractedProcedure[]
  medications: ExtractedMedication[]
  encounters: ExtractedEncounter[]
  diagnosticReports: ExtractedDiagnosticReport[]
  observations: ExtractedObservation[]
  immunizations: ExtractedImmunization[]
  evolutions: ExtractedEvolution[]
}

export interface ExtractedPatient {
  fullName: string
  familyName: string
  givenNames: string[]
  birthDate?: string
  declaredAge?: number
  dni?: string
  cuil?: string
  coverageName?: string
  coverageMemberId?: string
  addressText?: string
  phone?: string
  contactText?: string
  email?: string
}

export interface ExtractedClinicalHistory {
  patient: ExtractedPatient
  renalEtiology?: string
  firstDialysisDate?: string
  dialysis: Record<string, string>
  sections: ClinicalSection[]
  structured: ExtractedStructuredHistory
  warnings: string[]
}

export interface PatientImportPreview {
  schemaVersion: 1
  createdAt: string
  tenant: {
    slug: string
    targetProjectId: string
    targetOrganizationId: string
  }
  source: {
    absolutePath: string
    filename: string
    mediaType: string
    size: number
    modifiedAt: string
    sha256: string
    sha256Base64: string
  }
  patientKey: string
  ozrynMrn: string
  extraction: ExtractedClinicalHistory
  plannedResourceTypes: string[]
  review: {
    approved: false
    requiredChecks: string[]
  }
}

export interface AppliedResource {
  resourceType: string
  id: string
  versionId?: string
  action: 'created' | 'reused' | 'updated'
}

export interface PatientImportResult {
  schemaVersion: 1
  status: 'applied' | 'verified'
  appliedAt: string
  verifiedAt?: string
  tenant: PatientImportPreview['tenant']
  patientKey: string
  sourceSha256: string
  patientId: string
  binaryId: string
  resources: AppliedResource[]
}
