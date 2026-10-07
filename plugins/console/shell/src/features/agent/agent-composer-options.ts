export const agentModeOptions = [
  { label: "Normal", value: "" },
  { label: "Plan", value: "plan" },
  { label: "Code", value: "code" },
] as const;

export const approvalModeOptions = [
  { label: "Profile default", value: "" },
  { label: "Request approval", value: "request" },
  { label: "Help me approve", value: "assisted" },
  { label: "Full access", value: "full" },
] as const;
