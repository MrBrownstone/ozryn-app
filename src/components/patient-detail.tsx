"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
            setError("Patient record not found.")
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load patient.")
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
        <p className="text-sm text-muted-foreground">Loading patient…</p>
      </Card>
    )
  }

  if (error || !patient) {
    return (
      <Card className="p-6 border-border/60">
        <Alert className="border-destructive/20 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertTitle>Patient unavailable</AlertTitle>
          <AlertDescription>{error ?? "Patient could not be loaded."}</AlertDescription>
        </Alert>
      </Card>
    )
  }

  return (
    <Card className="p-6 border-border/60">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{patient.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            MRN: {patient.mrn} • DOB: {patient.birthDate} • Age: {patient.age}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">Patient/{patient.id}</Button>
          {onEditPatient ? (
            <Button size="sm" onClick={onEditPatient}>
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 mb-6 md:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4 bg-cyan-50/70 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Gender</p>
          <p className="text-lg font-semibold text-foreground">{patient.gender}</p>
          <p className="text-xs text-cyan-600 mt-1">FHIR Patient.gender</p>
        </Card>
        <Card className="p-4 bg-cyan-50/70 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Address</p>
          <p className="text-sm font-semibold text-foreground">{patient.address}</p>
          <p className="text-xs text-cyan-600 mt-1">Primary home address</p>
        </Card>
        <Card className="p-4 bg-cyan-50/70 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Contact</p>
          <p className="text-sm font-semibold text-foreground">{patient.phone}</p>
          <p className="text-xs text-cyan-600 mt-1">{patient.email}</p>
        </Card>
        <Card className="p-4 bg-cyan-50/70 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <p className="text-lg font-semibold text-foreground">
            {patient.status[0].toUpperCase() + patient.status.slice(1)}
          </p>
          <p className="text-xs text-cyan-600 mt-1">Project-scoped patient record</p>
        </Card>
        <Card className="p-4 bg-cyan-50/70 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
          <p className="text-sm font-semibold text-foreground">{patient.lastUpdated}</p>
          <p className="text-xs text-cyan-600 mt-1">Latest Medplum sync</p>
        </Card>
      </div>

      <Alert className="border-amber-200 bg-amber-50">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900">Live tenant data</AlertTitle>
        <AlertDescription className="text-amber-800">
          This header is now reading the patient directly from the active Medplum project instead of placeholder demo data.
        </AlertDescription>
      </Alert>
    </Card>
  )
}
