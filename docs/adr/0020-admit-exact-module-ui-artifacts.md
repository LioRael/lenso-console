---
status: accepted
---

# Admit exact Module UI artifacts

Console admits an exact Module UI Component digest only after four stages:
manifest, provenance, publisher policy, world, Operation, catalog, and asset
verification; static Component validation and import audit; isolated
instantiation with metadata, initialization, fixture, and budget probes; and
successful readiness inside a candidate Console Generation.

A signature proves origin but does not grant execution. Admission additionally
requires an administrator choice or explicit organization policy and exact
artifact identity. A connected Target App may advertise metadata but cannot
install code, and no failed candidate disturbs the active generation.

## Consequences

Admission evidence binds the Module release, descriptors, localization
catalogs, assets, SBOM, provenance, world version, and Component bytes. Console
must preserve structured evidence for rejection, quarantine, candidate failure,
activation, and rollback.
