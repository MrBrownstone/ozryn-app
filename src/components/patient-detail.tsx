"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { getPatientDetail, type UiPatientDetail } from "@/lib/patient-service"

interface PatientDetailProps {
  patientId: string
  refreshKey?: number
  onEditPatient?: () => void
}

export function PatientDetail({
  patientId,
  refreshKey = 0,
  onEditPatient,
}: PatientDetailProps) {
  const [patient, setPatient] = useState<UiPatientDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await getPatientDetail(patientId)
        if (!cancelled) {
          setPatient(result)
          if (!result) {
            setError("No se encontró el registro del paciente.")
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "No se pudo cargar el paciente.")
          setPatient(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [patientId, refreshKey])

  if (loading) {
    return (
      <Card className="p-6 border-border/60">
          <p className="text-sm text-muted-foreground">Cargando paciente…</p>
      </Card>
    )
  }

  if (error || !patient) {
    return (
      <Card className="p-6 border-border/60">
        <Alert className="border-destructive/20 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertTitle>Paciente no disponible</AlertTitle>
          <AlertDescription>{error ?? "No se pudo cargar el paciente."}</AlertDescription>
        </Alert>
      </Card>
    )
  }

  return (
    <Card className="border-border/70 p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{patient.name}</h1>
            <Badge variant="outline">{patient.status === 'active' ? 'Activo' : 'Inactivo'}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            MRN {patient.mrn} · Nacimiento {patient.birthDate} · {patient.age} años
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
            Patient/{patient.id}
          </code>
          {onEditPatient ? (
            <Button size="sm" onClick={onEditPatient}>
              <Pencil className="w-4 h-4" />
              Editar
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-4 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Sexo administrativo</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{patient.gender}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">DNI</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{patient.dni}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">CUIL</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{patient.cuil}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Contacto relacionado</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{patient.relatedContact}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted-foreground">Domicilio</dt>
          <dd className="mt-1 break-words text-sm font-medium text-foreground">{patient.address}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Contacto</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{patient.phone}</dd>
          <dd className="break-all text-xs text-muted-foreground">{patient.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Última actualización</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{patient.lastUpdated}</dd>
        </div>
      </dl>
    </Card>
  )
}
