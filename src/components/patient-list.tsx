"use client"

import { useEffect, useState } from "react"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  searchPatientsForList,
  type UiPatientListItem,
} from "@/lib/patient-service"

interface PatientListProps {
  selectedPatient: string | null
  onSelectPatient: (id: string) => void
  onAddPatient?: () => void
  refreshKey?: number
}

export function PatientList({
  selectedPatient,
  onSelectPatient,
  onAddPatient,
  refreshKey = 0,
}: PatientListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [patients, setPatients] = useState<UiPatientListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await searchPatientsForList(searchTerm)
        if (!cancelled) {
          setPatients(res)
          if (!selectedPatient && !searchTerm.trim() && res.length > 0) {
            onSelectPatient(res[0].id)
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load patients")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [onSelectPatient, refreshKey, searchTerm, selectedPatient])

  return (
    <Card className="flex flex-col h-full border-border/60">
      <div className="p-4 border-b border-border/60">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Patients</h2>
          {onAddPatient ? (
            <Button
              type="button"
              size="icon-sm"
              onClick={onAddPatient}
              title="Add patient"
              aria-label="Add patient"
            >
              <Plus className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-600 border-b border-border/60">
          {error}
        </div>
      )}

      {loading && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/60">
          Loading patients…
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/60">
          {patients.map((patient) => (
            <button
              key={patient.id}
              onClick={() => onSelectPatient(patient.id)}
              className={`w-full p-4 text-left transition-colors hover:bg-cyan-50/50 ${
                selectedPatient === patient.id ? "bg-cyan-50 border-l-2 border-cyan-600" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <p className="font-medium text-foreground text-sm">{patient.name}</p>
                <Badge
                  variant={
                    patient.status === "active"
                      ? "default"
                      : patient.status === "pending"
                      ? "secondary"
                      : "outline"
                  }
                  className={
                    patient.status === "active"
                      ? "bg-cyan-100 text-cyan-700 hover:bg-cyan-100"
                      : patient.status === "pending"
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                      : ""
                  }
                >
                  {patient.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{patient.mrn}</p>
              {patient.lastVisitRaw && (
                <p className="text-xs text-muted-foreground mt-1">
                  {patient.lastVisitRaw}
                </p>
              )}
            </button>
          ))}

          {!loading && patients.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              No patients found.
              {onAddPatient ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={onAddPatient}
                >
                  <Plus className="w-4 h-4" />
                  Add patient
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}
