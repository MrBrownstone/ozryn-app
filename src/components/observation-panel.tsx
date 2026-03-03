"use client"

import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { getRecentObservations, UiObservationItem } from "@/lib/patient-service"

interface ObservationPanelProps {
  patientId: string
}

export function ObservationPanel({ patientId }: ObservationPanelProps) {
  const [items, setItems] = useState<UiObservationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const obs = await getRecentObservations(patientId)
        if (!cancelled) setItems(obs)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load observations")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [patientId])

  return (
    <Card className="p-6 border-border/60 flex flex-col">
      <h2 className="text-lg font-semibold text-foreground mb-4">Recent Observations</h2>

      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}
      {loading && (
        <p className="text-xs text-muted-foreground mb-2">Loading…</p>
      )}

      <div className="space-y-3">
        {items.map((obs) => (
          <div
            key={obs.name + obs.value + obs.unit}
            className="flex items-center justify-between p-3 bg-linear-to-r from-cyan-50/50 to-teal-50/50 rounded-lg border border-border/40"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{obs.name}</p>
              {obs.reference && (
                <p className="text-xs text-muted-foreground">Ref: {obs.reference}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-cyan-700">
                {obs.value}{" "}
                <span className="text-xs text-muted-foreground">{obs.unit}</span>
              </p>
              <div className="flex items-center justify-end gap-1 mt-1">
                {obs.trend === "up" && <TrendingUp className="w-4 h-4 text-red-500" />}
                {obs.trend === "down" && <TrendingDown className="w-4 h-4 text-cyan-600" />}
                {obs.trend === "stable" && <Minus className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </div>
        ))}

        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-muted-foreground">No recent observations.</p>
        )}
      </div>
    </Card>
  )
}
