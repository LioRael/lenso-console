export const consoleCapabilityWildcard = "*";
export const consoleSuperadminScope = "console.superadmin";

export function hasConsoleCapability(
  availableCapabilities: ReadonlySet<string>,
  requiredCapability: string
) {
  return (
    availableCapabilities.has(consoleCapabilityWildcard) ||
    availableCapabilities.has(consoleSuperadminScope) ||
    availableCapabilities.has(requiredCapability)
  );
}
