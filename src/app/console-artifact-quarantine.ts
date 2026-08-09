import type { ConsoleArtifactReceipt } from "./console-artifact-query";
import { ConsoleArtifactQuarantineError } from "./console-module-runtime";

export interface ConsoleArtifactQuarantine {
  readonly key: string;
  readonly moduleId: string;
  readonly artifactDigest: string;
  readonly surfaceIds: readonly string[];
  readonly evidence: readonly string[];
  readonly nextAction: string;
  readonly quarantinedAt: number;
}

const quarantined = new Map<string, ConsoleArtifactQuarantine>();
const listeners = new Set<() => void>();
let snapshot: readonly ConsoleArtifactQuarantine[] = [];

export function consoleArtifactQuarantineKey(
  artifact: Pick<ConsoleArtifactReceipt, "moduleId" | "artifactDigest">
): string {
  return `${artifact.moduleId}:${artifact.artifactDigest}`;
}

export function quarantineConsoleArtifact(
  artifact: ConsoleArtifactReceipt,
  error: unknown
): ConsoleArtifactQuarantine | null {
  if (!isQuarantineable(error)) {
    return null;
  }
  const quarantine: ConsoleArtifactQuarantine = {
    key: consoleArtifactQuarantineKey(artifact),
    moduleId: artifact.moduleId,
    artifactDigest: artifact.artifactDigest,
    surfaceIds: artifact.manifest.surfaces.map((surface) => surface.id),
    evidence:
      error instanceof ConsoleArtifactQuarantineError
        ? error.evidence
        : [error instanceof Error ? error.message : String(error)],
    nextAction:
      error instanceof ConsoleArtifactQuarantineError
        ? error.nextAction
        : "Publish a compatible framework Module Release and reconcile its exact Console UI artifact.",
    quarantinedAt: Date.now(),
  };
  quarantined.set(quarantine.key, quarantine);
  snapshot = [...quarantined.values()];
  for (const listener of listeners) {
    listener();
  }
  return quarantine;
}

export function getConsoleArtifactQuarantine(
  artifact: Pick<ConsoleArtifactReceipt, "moduleId" | "artifactDigest">
): ConsoleArtifactQuarantine | undefined {
  return quarantined.get(consoleArtifactQuarantineKey(artifact));
}

export function getConsoleArtifactQuarantines(): readonly ConsoleArtifactQuarantine[] {
  return snapshot;
}

export function clearConsoleArtifactQuarantine(
  artifact: Pick<ConsoleArtifactReceipt, "moduleId" | "artifactDigest">
): void {
  if (quarantined.delete(consoleArtifactQuarantineKey(artifact))) {
    snapshot = [...quarantined.values()];
    for (const listener of listeners) {
      listener();
    }
  }
}

export function subscribeConsoleArtifactQuarantine(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isQuarantineable(error: unknown): boolean {
  return (
    error instanceof ConsoleArtifactQuarantineError ||
    (error instanceof Error &&
      "code" in error &&
      ((error as { code?: unknown }).code === "incompatible" ||
        (error as { code?: unknown }).code === "invalid_request"))
  );
}
