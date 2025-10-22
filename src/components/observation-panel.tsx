"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card } from "@/components/ui/card"

interface ObservationPanelProps {
  patientId: string
}

const mockObservations = [
  { name: "Glucose", value: "95", unit: "mg/dL", trend: "stable", reference: "70-100" },
  { name: "Hemoglobin A1C", value: "5.8", unit: "%", trend: "down", reference: "<5.7" },
  { name: "Cholesterol", value: "185", unit: "mg/dL", trend: "stable", reference: "<200" },
  { name: "Creatinine", value: "0.9", unit: "mg/dL", trend: "up", reference: "0.7-1.3" },
]

export function ObservationPanel({ patientId }: ObservationPanelProps) {
  return (
    <Card className="p-6 border-border/60 flex flex-col">
      <h2 className="text-lg font-semibold text-foreground mb-4">Recent Observations</h2>
      <div className="space-y-3">
        {mockObservations.map((obs) => (
          <div
            key={obs.name}
            className="flex items-center justify-between p-3 bg-linear-to-r from-cyan-50/50 to-teal-50/50 rounded-lg border border-border/40"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{obs.name}</p>
              <p className="text-xs text-muted-foreground">Ref: {obs.reference}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-cyan-700">
                {obs.value} <span className="text-xs text-muted-foreground">{obs.unit}</span>
              </p>
              <div className="flex items-center justify-end gap-1 mt-1">
                {obs.trend === "up" && <TrendingUp className="w-4 h-4 text-red-500" />}
                {obs.trend === "down" && <TrendingDown className="w-4 h-4 text-cyan-600" />}
                {obs.trend === "stable" && <Minus className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
