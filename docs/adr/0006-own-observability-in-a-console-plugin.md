# ADR-0006: Own observability in a Console Plugin

Status: Accepted design; implementation pending.

## Context

Console needs a first-party request investigation experience, while Lenso
already has a removable App-side OpenTelemetry exporter. Telemetry is lossy and
operational. Host configuration/readiness and business audit are separate facts.
Putting ingestion, storage, queries, and trace UI in Console core would make an
optional tool part of every Console and would blur those truth boundaries.

## Decision

A removable Console observability Plugin owns OTLP/HTTP trace/log ingestion,
its bounded SQLite store and retention, query Capability, incremental feed, and
App-scoped Observe Workspace. The observed App's OTel Plugin remains responsible
for non-blocking signal export and trace propagation.

Console owns only Workspace integration and the contract-aware browser
transport. It does not gain observability tables or special query routes.
Authoritative runtime state remains target-Host owned and is unavailable until
an explicit inspection Capability is connected. Telemetry correlation labels
are hints, not authority.

The first release is loopback-only, token-admitted, size/queue bounded,
redacting, and retention-limited. It covers HTTP request list, trace detail,
related logs, ingestion health, and visible incompleteness. Metrics, alerting,
shared deployment, and analytics are deferred.

The detailed contract and tracer are in
[Console observability Plugin](../console-observability.md).

## Consequences

- Removing Observe removes its runtime behavior and UI without changing Kernel,
  Web, the observed App, or Console Shell.
- A slow or failed collector cannot fail the observed request.
- Telemetry cannot substitute for audit, durable Story, or active configuration.
- Observe cannot ship by adding a temporary observability API to Console core;
  the typed Workspace service transport is a required platform seam.
- The deferred cross-App Connector limits authoritative runtime correlation but
  does not block the first trace/log investigation product.

