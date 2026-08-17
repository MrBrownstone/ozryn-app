'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, FileSearch, ShieldAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  getPatientClinicalRecord,
  type UiClinicalEntry,
  type UiEvolutionReport,
  type UiPatientClinicalRecord,
} from '@/lib/patient-service'

type ClinicalView = 'history' | 'dialysis' | 'evolution'

function statusLabel(status: string | undefined): string | undefined {
  if (!status) return undefined
  return ({
    active: 'Activo',
    completed: 'Completado',
    draft: 'Borrador',
    finished: 'Finalizada',
    partial: 'Parcial',
    preliminary: 'Preliminar',
    unconfirmed: 'No confirmado',
    unknown: 'Estado desconocido',
  } as Record<string, string>)[status] ?? status
}

function SourceDisclosure({ source }: { source: string }) {
  return (
    <details className="group mt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none font-medium text-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Ver texto fuente
      </summary>
      <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-3 leading-5">
        {source}
      </p>
    </details>
  )
}

function ClinicalEntryList({ items, empty }: { items: UiClinicalEntry[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <article key={item.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium text-foreground">{item.title}</h3>
              {item.detail ? <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.date ? <span className="text-xs text-muted-foreground">{item.date}</span> : null}
              {item.status ? <Badge variant="outline">{statusLabel(item.status)}</Badge> : null}
            </div>
          </div>
          {item.source ? <SourceDisclosure source={item.source} /> : null}
        </article>
      ))}
    </div>
  )
}

function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-border/70 p-5 shadow-none">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </Card>
  )
}

function HistoryView({ record }: { record: UiPatientClinicalRecord }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Problemas y antecedentes" description="Condiciones extraídas; aún no validadas por un profesional.">
        <ClinicalEntryList items={record.conditions} empty="No hay condiciones estructuradas." />
      </Section>
      <Section title="Procedimientos">
        <ClinicalEntryList items={record.procedures} empty="No hay procedimientos estructurados." />
      </Section>
      <Section title="Tratamiento consignado al ingreso" description="Lista documental; no implica medicación activa actual.">
        <ClinicalEntryList items={record.medications} empty="No hay medicación estructurada." />
      </Section>
      <Section title="Internaciones y vacunación">
        <ClinicalEntryList
          items={[...record.encounters, ...record.immunizations]}
          empty="No hay internaciones o vacunaciones estructuradas."
        />
      </Section>
      <div className="xl:col-span-2">
        <Section title="Estudios complementarios">
          <ReportList reports={record.studies} empty="No hay estudios estructurados." />
        </Section>
      </div>
      {record.coverage ? (
        <div className="xl:col-span-2">
          <Section title="Cobertura">
            <ClinicalEntryList items={[record.coverage]} empty="No hay cobertura consignada." />
          </Section>
        </div>
      ) : null}
      <div className="xl:col-span-2">
        <Section
          title="Narrativa original"
          description="Se conserva para contexto y trazabilidad; no reemplaza los datos estructurados."
        >
          <div className="space-y-2">
            {record.narrativeSections.map((section) => (
              <details key={section.title} className="rounded-md border border-border px-4 py-3">
                <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {section.title}
                </summary>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {section.lines.map((line, index) => <p key={`${section.title}-${index}`}>{line}</p>)}
                </div>
              </details>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

function dialysisGroup(label: string): string {
  const value = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (/DIAS|TURNO|DURACION/.test(value)) return 'Programación'
  if (/ACCESO|FAV|FISTULA|FLUJO|PRESION|AGUJA/.test(value)) return 'Acceso y circuito'
  if (/PESO|TA\b|PRESION ARTERIAL/.test(value)) return 'Objetivos de sesión'
  return 'Dializador y baño'
}

function DialysisView({ record }: { record: UiPatientClinicalRecord }) {
  const dialysis = record.dialysis
  if (!dialysis) {
    return <Card className="p-6"><p className="text-sm text-muted-foreground">No hay un esquema dialítico estructurado.</p></Card>
  }
  const groups = new Map<string, typeof dialysis.parameters>()
  for (const parameter of dialysis.parameters) {
    const group = dialysisGroup(parameter.label)
    groups.set(group, [...(groups.get(group) ?? []), parameter])
  }
  return (
    <div className="space-y-4">
      <Card className="border-border/70 p-5 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan de tratamiento</p>
            <h2 className="mt-1 text-xl font-semibold">{dialysis.title}</h2>
            {dialysis.schedule ? <p className="mt-1 text-sm text-muted-foreground">{dialysis.schedule}</p> : null}
          </div>
          <Badge variant="outline">{statusLabel(dialysis.status) ?? 'Importado'}</Badge>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {[...groups].map(([group, parameters]) => (
          <Section key={group} title={group}>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {parameters.map((parameter) => (
                <div key={parameter.id} className="min-w-0 border-b border-border/70 pb-3 last:border-0">
                  <dt className="text-xs text-muted-foreground">{parameter.label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-foreground">{parameter.value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ))}
      </div>
    </div>
  )
}

function ReportList({ reports, empty }: { reports: UiEvolutionReport[]; empty: string }) {
  if (!reports.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <article key={report.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-foreground">{report.title}</h3>
              {report.date ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {report.date}
                </p>
              ) : null}
            </div>
            <Badge variant="outline">{statusLabel(report.status)}</Badge>
          </div>
          {report.observations.length ? (
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {report.observations.map((observation) => (
                <div key={observation.id} className="rounded-md bg-muted/50 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{observation.name}</dt>
                  <dd className="mt-0.5 font-semibold">
                    {observation.value}{observation.unit ? ` ${observation.unit}` : ''}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {report.detail ? <SourceDisclosure source={report.detail} /> : null}
        </article>
      ))}
    </div>
  )
}

function EvolutionView({ record }: { record: UiPatientClinicalRecord }) {
  return (
    <Section
      title="Evolución clínica"
      description="Cronología mensual con sus resultados relacionados. Las unidades ausentes no fueron inferidas."
    >
      <ReportList reports={record.evolutions} empty="No hay evoluciones estructuradas." />
    </Section>
  )
}

export function PatientClinicalRecord({
  patientId,
  refreshKey,
  view,
}: {
  patientId: string
  refreshKey: number
  view: ClinicalView
}) {
  const [record, setRecord] = useState<UiPatientClinicalRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRecord(null)
    setError(null)
    getPatientClinicalRecord(patientId)
      .then((result) => {
        if (!cancelled) setRecord(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la historia clínica.')
      })
    return () => { cancelled = true }
  }, [patientId, refreshKey])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>No se pudo cargar esta sección</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!record) {
    return <Card className="p-6"><p className="text-sm text-muted-foreground">Cargando datos clínicos…</p></Card>
  }

  return (
    <div className="space-y-4">
      <Alert className="border-amber-200 bg-amber-50/70 text-amber-950">
        <ShieldAlert className="size-4 text-amber-700" />
        <AlertTitle>Datos derivados del documento fuente</AlertTitle>
        <AlertDescription>
          La estructura facilita lectura y búsqueda, pero requiere validación clínica antes de usarse como dato confirmado.
        </AlertDescription>
      </Alert>
      {record.warnings.length ? (
        <Alert>
          <FileSearch className="size-4" />
          <AlertTitle>Carga parcial</AlertTitle>
          <AlertDescription>{record.warnings.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      {view === 'history' ? <HistoryView record={record} /> : null}
      {view === 'dialysis' ? <DialysisView record={record} /> : null}
      {view === 'evolution' ? <EvolutionView record={record} /> : null}
    </div>
  )
}
