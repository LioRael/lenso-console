# Retained TypeScript wire contracts

The SDK owns the contribution and workspace-service TypeScript snapshots.
These remain public SDK APIs. Their stable wire IDs and codecs are not
authorization or provider registration. Unused management, human-management,
token and Observe projections were removed with their former page consumers.

These files originated from contract generation. There is no supported Rust
code-generation or Cargo step, and no duplicate contract-crate copy to synchronize.
Maintain the TS public contract here when its owning protocol changes. Preserve
compatible exports until an explicitly reviewed API migration retires them.

The supported Console backend uses `src/protocol.ts` and `src/transport.ts`
with oRPC v2. Retained v1 wire helpers do not install or execute a native provider.
