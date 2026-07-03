import { useConsoleCapabilities } from "./console-capabilities";
import { hasConsoleCapability } from "./console-capability-matching";
import { useConsoleModulesMetadata } from "./console-module-metadata-query";
import type { ConsoleModuleMetadata } from "./console-module-resolver";

export type ConsoleResolvedAdminActionContribution = {
  kind: "admin_action";
  key: string;
  label: string;
  moduleName: string;
  actionName: string;
  input: Record<string, unknown>;
  requiredCapabilities: readonly string[];
  icon?: string | null;
};

export type ConsoleResolvedContribution =
  ConsoleResolvedAdminActionContribution;

export type ResolveConsoleSlotContributionsOptions = {
  availableCapabilities?: readonly string[];
  context?: Record<string, unknown>;
  slotId: string;
};

type SlotContextLookup =
  | { found: true; value: unknown }
  | { found: false; value?: never };

export function useConsoleSlotContributions(
  slotId: string,
  context: Record<string, unknown> = {}
): ConsoleResolvedContribution[] {
  const modulesQuery = useConsoleModulesMetadata();
  const availableCapabilities = useConsoleCapabilities();

  return resolveConsoleSlotContributions(modulesQuery.data?.modules ?? [], {
    availableCapabilities,
    context,
    slotId,
  });
}

export function resolveConsoleSlotContributions(
  modules: readonly ConsoleModuleMetadata[],
  options: ResolveConsoleSlotContributionsOptions
): ConsoleResolvedContribution[] {
  const acceptedSlotVersions = new Set<number>();
  for (const module of modules) {
    if (module.status === "error") {
      continue;
    }
    for (const slot of module.console_slots ?? []) {
      if (
        slot.id === options.slotId &&
        typeof slot.version === "number" &&
        slot.version > 0 &&
        (slot.accepts ?? []).includes("admin_action")
      ) {
        acceptedSlotVersions.add(slot.version);
      }
    }
  }
  if (acceptedSlotVersions.size === 0) {
    return [];
  }

  const availableCapabilities = options.availableCapabilities
    ? new Set(options.availableCapabilities)
    : new Set<string>();
  const context = options.context ?? {};
  const contributions: ConsoleResolvedContribution[] = [];

  modules.forEach((module, moduleIndex) => {
    if (module.status === "error") {
      return;
    }
    module.console_contributions?.forEach((contribution, contributionIndex) => {
      const { action, target_version: targetVersion } = contribution;
      if (
        contribution.target !== options.slotId ||
        typeof targetVersion !== "number" ||
        !acceptedSlotVersions.has(targetVersion) ||
        action?.kind !== "admin_action" ||
        !action.module ||
        !action.name
      ) {
        return;
      }

      const requiredCapabilities = contribution.required_capabilities ?? [];
      if (
        !requiredCapabilities.every((capability) =>
          hasConsoleCapability(availableCapabilities, capability)
        )
      ) {
        return;
      }

      const input = boundSlotInput(action.input_bindings ?? [], context);
      if (!input) {
        return;
      }

      const resolvedContribution: ConsoleResolvedAdminActionContribution = {
        actionName: action.name,
        input,
        key: [
          module.module_name ?? `module-${moduleIndex}`,
          options.slotId,
          String(targetVersion),
          action.module,
          action.name,
          String(contributionIndex),
        ].join(":"),
        kind: "admin_action",
        label: contribution.label ?? action.name,
        moduleName: action.module,
        requiredCapabilities,
      };
      if (contribution.icon !== undefined) {
        resolvedContribution.icon = contribution.icon;
      }
      contributions.push(resolvedContribution);
    });
  });

  return contributions;
}

function boundSlotInput(
  bindings: NonNullable<
    NonNullable<
      ConsoleModuleMetadata["console_contributions"]
    >[number]["action"]
  >["input_bindings"],
  context: Record<string, unknown>
): Record<string, unknown> | null {
  const input: Record<string, unknown> = {};
  for (const binding of bindings ?? []) {
    if (!binding.input || binding.value?.kind !== "slot_context") {
      return null;
    }
    const lookup = slotContextValue(context, binding.value.path);
    if (!lookup.found) {
      return null;
    }
    input[binding.input] = lookup.value;
  }
  return input;
}

function slotContextValue(
  context: Record<string, unknown>,
  path: string | undefined
): SlotContextLookup {
  if (!path) {
    return { found: false };
  }
  let current: unknown = context;
  for (const segment of path.split(".")) {
    if (
      !segment ||
      typeof current !== "object" ||
      current === null ||
      !(segment in current)
    ) {
      return { found: false };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}
