"use client"

import { CheckCircle2, Circle, AlertCircle } from "lucide-react"
import { Card } from "@/components/ui/card"

interface CarePlanPanelProps {
  patientId: string
}

const mockCarePlan = [
  { id: 1, task: "Monitor blood glucose daily", status: "completed", dueDate: "Ongoing" },
  { id: 2, task: "Increase physical activity to 30 min/day", status: "in-progress", dueDate: "By 12/31" },
  { id: 3, task: "Schedule follow-up appointment", status: "pending", dueDate: "By 12/15" },
  { id: 4, task: "Review medication side effects", status: "pending", dueDate: "By 12/20" },
]

export function CarePlanPanel({ patientId }: CarePlanPanelProps) {
  return (
    <Card className="p-6 border-border/60 flex flex-col">
      <h2 className="text-lg font-semibold text-foreground mb-4">Care Plan</h2>
      <div className="space-y-3">
        {mockCarePlan.map((item) => (
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
                className={`text-sm font-medium ${item.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}
              >
                {item.task}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{item.dueDate}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
