export const consoleCapabilityWildcard = "*";

export function hasConsoleCapability(
  availableCapabilities: ReadonlySet<string>,
  requiredCapability: string
) {
  return (
    availableCapabilities.has(consoleCapabilityWildcard) ||
    availableCapabilities.has(requiredCapability)
  );
}
