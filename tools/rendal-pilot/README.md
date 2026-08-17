# RENDAL single-patient pilot importer

This CLI imports one reviewed RENDAL DOCX clinical history into an explicitly selected Medplum project. It is intentionally not a bulk importer.

The workflow is `prepare -> human review -> apply -> verify`. Patient-specific previews, approvals and results live outside the app repository under `../.tmp/RENDAL-PILOT` with private filesystem permissions. Do not commit that directory.

Every apply attempt writes a timestamped private run record. Re-running the same reviewed source is expected to report `reused` for every resource and create no duplicate clinical records.

```sh
pnpm rendal:pilot prepare \
  --source "/absolute/path/to/patient.docx" \
  --tenant rendal \
  --target-project "project-uuid" \
  --target-organization "organization-uuid"

pnpm rendal:pilot validate \
  --preview "/absolute/path/to/preview.json"

pnpm rendal:pilot apply \
  --preview "/absolute/path/to/preview.json" \
  --yes \
  --approval-note "reviewed for the controlled local pilot"

pnpm rendal:pilot verify \
  --result "/absolute/path/to/apply-result.json"
```

`apply` refuses non-local Medplum URLs unless `--allow-nonlocal` is supplied. That flag is not permission by itself; it exists so a future non-local run is conspicuous and can be preceded by an environment and authorization review.

See [MAPPING.md](./MAPPING.md) for translation and fidelity rules.
