"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Circle, AlertCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { getCarePlanItems, UiCarePlanItem } from "@/lib/patient-service"

interface CarePlanPanelProps {
  patientId: string
}

export function CarePlanPanel({ patientId }: CarePlanPanelProps) {
  const [items, setItems] = useState<UiCarePlanItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await getCarePlanItems(patientId)
        if (!cancelled) setItems(res)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load care plan")
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
      <h2 className="text-lg font-semibold text-foreground mb-4">Care Plan</h2>

      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}
      {loading && (
        <p className="text-xs text-muted-foreground mb-2">Loading…</p>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 p-3 bg-gradient-to-r from-cyan-50/50 to-teal-50/50 rounded-lg border border-border/40"
          >
            <div className="mt-0.5">
              {item.status === "completed" && <CheckCircle2 className="w-5 h-5 text-cyan-600" />}
              {item.status === "in-progress" && <AlertCircle className="w-5 h-5 text-amber-500" />}
              {item.status === "pending" && <Circle className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  item.status === "completed"
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {item.task}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{item.dueDate}</p>
            </div>
          </div>
        ))}

        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-muted-foreground">No active care plan.</p>
        )}
      </div>
    </Card>
  )
}
