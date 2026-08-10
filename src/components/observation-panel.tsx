"use client"

import { useEffect, useState } from "react"
import { Minus, Plus, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getRecentObservations, UiObservationItem } from "@/lib/patient-service"

interface ObservationPanelProps {
  patientId: string
  count?: number
  refreshKey?: number
  onAddObservation?: () => void
}

export function ObservationPanel({
  patientId,
  count = 4,
  refreshKey = 0,
  onAddObservation,
}: ObservationPanelProps) {
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
        const obs = await getRecentObservations(patientId, count)
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
  }, [count, patientId, refreshKey])

  return (
    <Card className="p-6 border-border/60 flex flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Recent Observations</h2>
        {onAddObservation ? (
          <Button type="button" size="sm" onClick={onAddObservation}>
            <Plus className="w-4 h-4" />
            Add
          </Button>
        ) : null}
      </div>

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
              {obs.recordedAt && (
                <p className="text-xs text-muted-foreground">{obs.recordedAt}</p>
              )}
              {obs.note && (
                <p className="mt-1 text-xs text-muted-foreground">{obs.note}</p>
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
