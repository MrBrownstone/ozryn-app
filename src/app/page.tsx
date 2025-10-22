"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { TopNav } from "@/components/top-nav"
import { PatientList } from "@/components/patient-list"
import { PatientDetail } from "@/components/patient-detail"
import { ObservationPanel } from "@/components/observation-panel"
import { CarePlanPanel } from "@/components/care-plan-panel"
import { Card } from "@/components/ui/card"

export default function Dashboard() {
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-auto">
          <div className="grid grid-cols-12 gap-4 p-6 h-full">
            {/* Patient List - Left Panel */}
            <div className="col-span-3 flex flex-col gap-4">
              <PatientList selectedPatient={selectedPatient} onSelectPatient={(id) => setSelectedPatient(id)} />
            </div>

            {/* Main Content Area */}
            <div className="col-span-9 flex flex-col gap-4">
              {selectedPatient ? (
                <>
                  <PatientDetail patientId={selectedPatient} />
                  <div className="grid grid-cols-2 gap-4">
                    <ObservationPanel patientId={selectedPatient} />
                    <CarePlanPanel patientId={selectedPatient} />
                  </div>
                </>
              ) : (
                <Card className="flex items-center justify-center h-full border-border/60">
                  <div className="text-center">
                    <p className="text-muted-foreground text-lg">Select a patient to view details</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
