import type {
  ConsoleConnectionStatus,
  ConsoleSystemConnection,
  ConsoleSystemConnectionModule,
} from "@lenso/console-ui";

export type ConsoleArtifactIdentity = {
  artifactDigest: string;
  moduleId: string;
  moduleReleaseDigest: string;
};

export function connectionModuleForArtifact(
  connection: ConsoleSystemConnection | null | undefined,
  artifact: ConsoleArtifactIdentity
): ConsoleSystemConnectionModule | undefined {
  return connection?.modules.find(
    (module) =>
      module.moduleId === artifact.moduleId &&
      module.moduleReleaseDigest === artifact.moduleReleaseDigest &&
      (module.consoleUiArtifactDigest === null ||
        module.consoleUiArtifactDigest === undefined ||
        module.consoleUiArtifactDigest === artifact.artifactDigest)
  );
}

export function connectionModuleState(
  connection: ConsoleSystemConnection | null | undefined,
  moduleId: string
): ConsoleSystemConnectionModule | undefined {
  return connection?.modules.find((module) => module.moduleId === moduleId);
}

export function isConnectedModule(
  module: ConsoleSystemConnectionModule | undefined
): boolean {
  return module?.status === "connected";
}

export function connectionStatusLabel(status: ConsoleConnectionStatus): string {
  switch (status) {
    case "connected": {
      return "Connected";
    }
    case "unavailable": {
      return "Unavailable";
    }
    case "incompatible": {
      return "Incompatible";
    }
    case "unmanaged": {
      return "Unmanaged";
    }
    default: {
      return "Unknown";
    }
  }
}
