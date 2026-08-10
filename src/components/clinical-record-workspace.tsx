'use client'

import type { ComponentProps, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileText,
  ListChecks,
  Plus,
  Stethoscope,
  UserPlus,
} from 'lucide-react'

import { CarePlanPanel } from '@/components/care-plan-panel'
import { ObservationPanel } from '@/components/observation-panel'
import { PatientDetail } from '@/components/patient-detail'
import { PatientList } from '@/components/patient-list'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TenantAppShell } from '@/components/tenant-app-shell'
import {
  createFollowUpTask,
  createObservation,
  createPatient,
  createPatientDocumentReference,
  getFollowUpTasks,
  getPatientById,
  getPatientDocuments,
  patientToFormInput,
  updateFollowUpTaskStatus,
  updatePatient,
  type FollowUpTaskInput,
  type PatientDocumentInput,
  type PatientFormInput,
  type UiFollowUpTask,
  type UiPatientDocument,
} from '@/lib/patient-service'

const emptyPatientForm: PatientFormInput = {
  firstName: '',
  lastName: '',
  birthDate: '',
  gender: '',
  mrn: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  active: true,
}

function localDateTimeValue(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function Field({
  label,
  ...props
}: ComponentProps<typeof Input> & {
  label: string
}) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      <Input {...props} />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="border-input min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </label>
  )
}

function PatientFormDialog({
  open,
  patientId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  patientId: string | null
  onOpenChange: (open: boolean) => void
  onSaved: (patientId: string) => void
}) {
  const [form, setForm] = useState<PatientFormInput>(emptyPatientForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = Boolean(patientId)

  useEffect(() => {
    let cancelled = false

    async function loadPatient() {
      if (!open) {
        return
      }

      setError(null)

      if (!patientId) {
        setForm(emptyPatientForm)
        return
      }

      setLoading(true)
      try {
        const patient = await getPatientById(patientId)
        if (!cancelled) {
          if (!patient) {
            setError('Patient record not found.')
            setForm(emptyPatientForm)
          } else {
            setForm(patientToFormInput(patient))
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load patient.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadPatient().catch(console.error)

    return () => {
      cancelled = true
    }
  }, [open, patientId])

  const updateForm = (patch: Partial<PatientFormInput>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const patient =
        patientId && editing
          ? await updatePatient(patientId, form)
          : await createPatient(form)

      if (!patient.id) {
        throw new Error('Medplum did not return a patient id.')
      }

      onSaved(patient.id)
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || 'Could not save patient.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit patient' : 'Add patient'}</DialogTitle>
          <DialogDescription>
            Demographics and contact details are saved as a Medplum Patient resource.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <Alert className="border-destructive/20 bg-destructive/5">
              <AlertTitle>Patient could not be saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="First name"
              value={form.firstName}
              onChange={(event) => updateForm({ firstName: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="Last name"
              value={form.lastName}
              onChange={(event) => updateForm({ lastName: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="MRN"
              value={form.mrn}
              onChange={(event) => updateForm({ mrn: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="Birth date"
              type="date"
              value={form.birthDate}
              onChange={(event) => updateForm({ birthDate: event.target.value })}
              disabled={loading || saving}
            />
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>Gender</span>
              <select
                value={form.gender}
                onChange={(event) =>
                  updateForm({ gender: event.target.value as PatientFormInput['gender'] })
                }
                disabled={loading || saving}
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">Unknown</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-md border border-border/60 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => updateForm({ active: event.target.checked })}
                disabled={loading || saving}
              />
              Active patient
            </label>
            <Field
              label="Phone"
              value={form.phone}
              onChange={(event) => updateForm({ phone: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => updateForm({ email: event.target.value })}
              disabled={loading || saving}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Address line 1"
              value={form.addressLine1}
              onChange={(event) => updateForm({ addressLine1: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="Address line 2"
              value={form.addressLine2}
              onChange={(event) => updateForm({ addressLine2: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="City"
              value={form.city}
              onChange={(event) => updateForm({ city: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="State"
              value={form.state}
              onChange={(event) => updateForm({ state: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="Postal code"
              value={form.postalCode}
              onChange={(event) => updateForm({ postalCode: event.target.value })}
              disabled={loading || saving}
            />
            <Field
              label="Country"
              value={form.country}
              onChange={(event) => updateForm({ country: event.target.value })}
              disabled={loading || saving}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || saving}>
              {saving ? 'Saving...' : 'Save patient'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ObservationFormDialog({
  open,
  patientId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  patientId: string | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [display, setDisplay] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [effectiveDateTime, setEffectiveDateTime] = useState(localDateTimeValue())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDisplay('')
      setValue('')
      setUnit('')
      setNote('')
      setEffectiveDateTime(localDateTimeValue())
      setError(null)
    }
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!patientId) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createObservation({
        patientId,
        display,
        value,
        unit,
        effectiveDateTime,
        note,
      })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || 'Could not add observation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add observation</DialogTitle>
          <DialogDescription>
            Save a basic measurement or clinical data point under this patient.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <Alert className="border-destructive/20 bg-destructive/5">
              <AlertTitle>Observation could not be saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field
            label="Name"
            value={display}
            onChange={(event) => setDisplay(event.target.value)}
            placeholder="Blood pressure, HbA1c, Weight"
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
            <Field
              label="Unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="mmHg, %, kg"
            />
          </div>
          <Field
            label="Recorded at"
            type="datetime-local"
            value={effectiveDateTime}
            onChange={(event) => setEffectiveDateTime(event.target.value)}
          />
          <TextAreaField label="Note" value={note} onChange={setNote} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Add observation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FollowUpFormDialog({
  open,
  patientId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  patientId: string | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<FollowUpTaskInput['priority']>('routine')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDescription('')
      setPriority('routine')
      setDueDate('')
      setError(null)
    }
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!patientId) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createFollowUpTask({
        patientId,
        description,
        priority,
        dueDate,
        status: 'requested',
      })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || 'Could not create follow-up.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add follow-up</DialogTitle>
          <DialogDescription>
            Track the next clinical action as a Medplum Task.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <Alert className="border-destructive/20 bg-destructive/5">
              <AlertTitle>Follow-up could not be saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <TextAreaField
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="Call patient after lab review"
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>Priority</span>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as FollowUpTaskInput['priority'])
                }
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="asap">ASAP</option>
                <option value="stat">STAT</option>
              </select>
            </label>
            <Field
              label="Due date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Add follow-up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DocumentFormDialog({
  open,
  patientId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  patientId: string | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Omit<PatientDocumentInput, 'patientId'>>({
    title: '',
    category: '',
    date: localDateTimeValue(),
    url: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({
        title: '',
        category: '',
        date: localDateTimeValue(),
        url: '',
      })
      setError(null)
    }
  }, [open])

  const updateForm = (patch: Partial<Omit<PatientDocumentInput, 'patientId'>>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!patientId) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createPatientDocumentReference({
        patientId,
        ...form,
      })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || 'Could not add document reference.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add document reference</DialogTitle>
          <DialogDescription>
            Add metadata or a link now. Full S3/Binary upload comes in the ingestion phase.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <Alert className="border-destructive/20 bg-destructive/5">
              <AlertTitle>Document could not be saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field
            label="Title"
            value={form.title}
            onChange={(event) => updateForm({ title: event.target.value })}
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Category"
              value={form.category}
              onChange={(event) => updateForm({ category: event.target.value })}
              placeholder="Referral, Lab report"
            />
            <Field
              label="Date"
              type="datetime-local"
              value={form.date}
              onChange={(event) => updateForm({ date: event.target.value })}
            />
          </div>
          <Field
            label="External URL"
            type="url"
            value={form.url}
            onChange={(event) => updateForm({ url: event.target.value })}
            placeholder="https://..."
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Add document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FollowUpsPanel({
  patientId,
  refreshKey,
  onAdd,
  onChanged,
}: {
  patientId: string
  refreshKey: number
  onAdd: () => void
  onChanged: () => void
}) {
  const [items, setItems] = useState<UiFollowUpTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const tasks = await getFollowUpTasks(patientId)
        if (!cancelled) {
          setItems(tasks)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load follow-ups.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load().catch(console.error)
    return () => {
      cancelled = true
    }
  }, [patientId, refreshKey])

  const markCompleted = async (taskId: string) => {
    setUpdatingId(taskId)
    setError(null)
    try {
      await updateFollowUpTaskStatus(taskId, 'completed')
      onChanged()
    } catch (err: any) {
      setError(err?.message || 'Could not update follow-up.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <Card className="p-6 border-border/60">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Follow-ups</h2>
        <Button type="button" size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>

      {error ? <p className="mb-3 text-xs text-red-600">{error}</p> : null}
      {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : null}

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-border/60 bg-background p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  Due {item.dueDate} · {item.owner}
                </p>
              </div>
              <Badge variant={item.status === 'completed' ? 'secondary' : 'outline'}>
                {item.status}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Priority: {item.priority} · Created {item.authoredOn}
              </p>
              {item.status !== 'completed' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => markCompleted(item.id)}
                  disabled={updatingId === item.id}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Done
                </Button>
              ) : null}
            </div>
          </div>
        ))}

        {!loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups yet.</p>
        ) : null}
      </div>
    </Card>
  )
}

function DocumentsPanel({
  patientId,
  refreshKey,
  onAdd,
}: {
  patientId: string
  refreshKey: number
  onAdd: () => void
}) {
  const [items, setItems] = useState<UiPatientDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const documents = await getPatientDocuments(patientId)
        if (!cancelled) {
          setItems(documents)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load documents.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load().catch(console.error)
    return () => {
      cancelled = true
    }
  }, [patientId, refreshKey])

  return (
    <Card className="p-6 border-border/60">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Documents</h2>
        <Button type="button" size="sm" onClick={onAdd}>
          <FilePlus2 className="w-4 h-4" />
          Add
        </Button>
      </div>

      {error ? <p className="mb-3 text-xs text-red-600">{error}</p> : null}
      {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : null}

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-border/60 bg-background p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.category} · {item.date}
                </p>
              </div>
              {item.url ? (
                <Button asChild size="sm" variant="outline">
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </Button>
              ) : (
                <Badge variant="outline">Metadata</Badge>
              )}
            </div>
          </div>
        ))}

        {!loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No document references yet.</p>
        ) : null}
      </div>
    </Card>
  )
}

export function ClinicalRecordWorkspace() {
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [patientDialogOpen, setPatientDialogOpen] = useState(false)
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null)
  const [observationDialogOpen, setObservationDialogOpen] = useState(false)
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false)
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false)

  const refreshClinicalRecord = () => setRefreshKey((current) => current + 1)

  const openNewPatient = () => {
    setEditingPatientId(null)
    setPatientDialogOpen(true)
  }

  const openEditPatient = () => {
    if (!selectedPatient) {
      return
    }
    setEditingPatientId(selectedPatient)
    setPatientDialogOpen(true)
  }

  const handlePatientSaved = (patientId: string) => {
    setSelectedPatient(patientId)
    refreshClinicalRecord()
  }

  return (
    <TenantAppShell>
      <div className="grid min-h-full gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-6">
        <PatientList
          selectedPatient={selectedPatient}
          onSelectPatient={setSelectedPatient}
          onAddPatient={openNewPatient}
          refreshKey={refreshKey}
        />

        <div className="min-w-0 space-y-4">
          {selectedPatient ? (
            <Tabs defaultValue="overview" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
                  <TabsTrigger value="overview">
                    <ClipboardList className="w-4 h-4" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="data">
                    <Stethoscope className="w-4 h-4" />
                    Data
                  </TabsTrigger>
                  <TabsTrigger value="followups">
                    <ListChecks className="w-4 h-4" />
                    Follow-ups
                  </TabsTrigger>
                  <TabsTrigger value="documents">
                    <FileText className="w-4 h-4" />
                    Documents
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="space-y-4">
                <PatientDetail
                  patientId={selectedPatient}
                  refreshKey={refreshKey}
                  onEditPatient={openEditPatient}
                />
                <div className="grid gap-4 xl:grid-cols-2">
                  <ObservationPanel
                    patientId={selectedPatient}
                    refreshKey={refreshKey}
                    onAddObservation={() => setObservationDialogOpen(true)}
                  />
                  <CarePlanPanel patientId={selectedPatient} />
                </div>
              </TabsContent>

              <TabsContent value="data">
                <ObservationPanel
                  patientId={selectedPatient}
                  count={10}
                  refreshKey={refreshKey}
                  onAddObservation={() => setObservationDialogOpen(true)}
                />
              </TabsContent>

              <TabsContent value="followups">
                <FollowUpsPanel
                  patientId={selectedPatient}
                  refreshKey={refreshKey}
                  onAdd={() => setFollowUpDialogOpen(true)}
                  onChanged={refreshClinicalRecord}
                />
              </TabsContent>

              <TabsContent value="documents">
                <DocumentsPanel
                  patientId={selectedPatient}
                  refreshKey={refreshKey}
                  onAdd={() => setDocumentDialogOpen(true)}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="flex min-h-[520px] items-center justify-center border-border/60 p-8">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                  <UserPlus className="w-6 h-6" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground">Clinical record</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Select a patient from the registry or create the first Medplum-backed
                  patient record for this tenant.
                </p>
                <Button type="button" className="mt-5" onClick={openNewPatient}>
                  <Plus className="w-4 h-4" />
                  Add patient
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <PatientFormDialog
        open={patientDialogOpen}
        patientId={editingPatientId}
        onOpenChange={setPatientDialogOpen}
        onSaved={handlePatientSaved}
      />
      <ObservationFormDialog
        open={observationDialogOpen}
        patientId={selectedPatient}
        onOpenChange={setObservationDialogOpen}
        onSaved={refreshClinicalRecord}
      />
      <FollowUpFormDialog
        open={followUpDialogOpen}
        patientId={selectedPatient}
        onOpenChange={setFollowUpDialogOpen}
        onSaved={refreshClinicalRecord}
      />
      <DocumentFormDialog
        open={documentDialogOpen}
        patientId={selectedPatient}
        onOpenChange={setDocumentDialogOpen}
        onSaved={refreshClinicalRecord}
      />
    </TenantAppShell>
  )
}
