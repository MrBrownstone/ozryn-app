"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface PatientDetailProps {
  patientId: string
}

export function PatientDetail({ patientId }: PatientDetailProps) {
  return (
    <Card className="p-6 border-border/60">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sarah Mitchell</h1>
          <p className="text-muted-foreground text-sm mt-1">MRN: MRN-2024-001 • DOB: 03/15/1985 • Age: 39</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Edit
          </Button>
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white">
            View Full Record
          </Button>
        </div>
      </div>

      {/* Vital Signs Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-gradient-to-br from-cyan-50 to-teal-50 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Blood Pressure</p>
          <p className="text-lg font-semibold text-foreground">120/80</p>
          <p className="text-xs text-cyan-600 mt-1">mmHg • Normal</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-cyan-50 to-teal-50 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Heart Rate</p>
          <p className="text-lg font-semibold text-foreground">72</p>
          <p className="text-xs text-cyan-600 mt-1">bpm • Normal</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-cyan-50 to-teal-50 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Temperature</p>
          <p className="text-lg font-semibold text-foreground">98.6</p>
          <p className="text-xs text-cyan-600 mt-1">°F • Normal</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-cyan-50 to-teal-50 border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Last Visit</p>
          <p className="text-lg font-semibold text-foreground">2 hrs</p>
          <p className="text-xs text-cyan-600 mt-1">ago • Routine</p>
        </Card>
      </div>

      {/* Alert */}
      <Alert className="border-amber-200 bg-amber-50">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900">Medication Review Due</AlertTitle>
        <AlertDescription className="text-amber-800">Annual medication review scheduled for next week</AlertDescription>
      </Alert>
    </Card>
  )
}
