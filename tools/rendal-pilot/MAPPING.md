# RENDAL DOCX to FHIR mapping

| Source | FHIR target | Rule |
| --- | --- | --- |
| Name | `Patient.name` | The patient folder supplies the family-name boundary only when it matches the start of the document heading. |
| Birth date | `Patient.birthDate` | Four-digit years are direct. A two-digit century is selected using declared age and the most recent clinical year, with a review warning. |
| DNI / CUIL | `Patient.identifier` | Stored under OZRYN-owned Argentine identifier systems. Existing DNI without the prepared patient key stops the import for manual reconciliation. |
| Source patient identity | `Patient.identifier` | Opaque SHA-256-derived RENDAL patient key. Names are never the final match key. |
| OZRYN MRN | `Patient.identifier` | Deterministic `REN-...` value generated for app display; it is not represented as a legacy institution MRN. |
| Address, phone, email | `Patient.address` / `Patient.telecom` | Only unambiguous values are mapped. Relationship-only contact text remains in the Composition. |
| OOSS | `Coverage` | Imported as `draft`; the DOCX cannot establish current administrative validity. |
| Dialysis section | `CarePlan` | Preserved as a patient-specific plan and textual parameter snapshot, not converted into new medical orders. |
| All text sections | `Composition` | Imported as `preliminary`, restricted narrative. No clinician attestation is fabricated. |
| Monthly evolutions and plausible numeric patterns | `DiagnosticReport` (`partial`) + `Observation` (`preliminary`) + `Composition` | Each month is grouped as source-derived laboratory data. The narrative is preserved once in `Composition` and the DOCX, never copied into every Observation. Missing units and standard terminology are not inferred. |
| Dated complementary imaging study | `DiagnosticReport` | Imported as `partial`, with the source narrative as the conclusion; it remains source-derived and requires review. |
| Original DOCX | `Binary` + `DocumentReference` | Byte-for-byte upload with SHA-256, size, media type, source provenance and patient security context. Embedded images remain in the DOCX. |

Source-derived laboratory resources remain unvalidated: they are not final reports, do not receive inferred units or SNOMED/LOINC codes, and require clinician confirmation before clinical use.
