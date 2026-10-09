---
"@lenso/console-sdk": minor
---

Replace legacy capability providers and generated wire snapshots with current TypeScript Plugin, explicit Manage operations, and owner-bound Console mounts. Keep inferred parse/authorize/handle types and browser-only service projections; add explicitly declared streams and canonical validated Console schemas.

This pre-1.0 minor release removes `/contribution`, `/workspace-service`, `InvocationContext`, and base64 `InvokeResult` authoring APIs. Regenerate compiled output and register its exact Plugin, Manage declaration, and mounts as described in the SDK migration guide. No registry publication or production deployment is performed by this change.
