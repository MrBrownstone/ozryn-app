"use client"

import { Search } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

interface PatientListProps {
  selectedPatient: string | null
  onSelectPatient: (id: string) => void
}

const mockPatients = [
  { id: "1", name: "Sarah Mitchell", mrn: "MRN-2024-001", status: "active", lastVisit: "2 hours ago" },
  { id: "2", name: "James Chen", mrn: "MRN-2024-002", status: "active", lastVisit: "1 day ago" },
  { id: "3", name: "Emma Rodriguez", mrn: "MRN-2024-003", status: "pending", lastVisit: "3 days ago" },
  { id: "4", name: "Michael Torres", mrn: "MRN-2024-004", status: "active", lastVisit: "5 hours ago" },
  { id: "5", name: "Lisa Anderson", mrn: "MRN-2024-005", status: "inactive", lastVisit: "2 weeks ago" },
]

export function PatientList({ selectedPatient, onSelectPatient }: PatientListProps) {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredPatients = mockPatients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.mrn.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <Card className="flex flex-col h-full border-border/60">
      <div className="p-4 border-b border-border/60">
        <h2 className="text-lg font-semibold text-foreground mb-3">Patient List</h2>
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

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/60">
          {filteredPatients.map((patient) => (
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
                    patient.status === "active" ? "default" : patient.status === "pending" ? "secondary" : "outline"
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
              <p className="text-xs text-muted-foreground mt-1">{patient.lastVisit}</p>
            </button>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}
