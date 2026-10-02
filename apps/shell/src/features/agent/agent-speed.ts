import type { AgentModel } from "./agent-runtime";

export function speedMenu(model: AgentModel | undefined, selected?: string) {
  const tiers = [...new Set(model?.serviceTiers)];
  const codex = model?.providerId === "chatgpt";
  const fast = codex
    ? (tiers.find((tier) => tier === "fast") ??
      tiers.find((tier) => tier === "priority"))
    : undefined;
  const options = tiers.length
    ? [
        { label: "Default", value: "" },
        ...tiers
          .filter(
            (tier) => !fast || tier !== (fast === "fast" ? "priority" : "fast")
          )
          .map((tier) => ({
            label:
              codex && tier === fast
                ? "Fast"
                : tier === "default"
                  ? "Standard"
                  : tier,
            value: tier,
          })),
      ]
    : [];
  return {
    options,
    value:
      fast && (selected === "fast" || selected === "priority")
        ? fast
        : (selected ?? ""),
  };
}
