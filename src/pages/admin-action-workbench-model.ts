import type { AdminActionInvokeRequest } from "@lenso/ts-sdk";

export function adminActionInvokePath(
  moduleName: string,
  actionName: string
): string {
  return `admin/data/${encodeURIComponent(moduleName)}/actions/${encodeURIComponent(actionName)}`;
}

export function adminActionInvokeRequest(
  input: Record<string, unknown>,
  confirmationPhrase?: string
): AdminActionInvokeRequest {
  return {
    input,
    ...(confirmationPhrase ? { confirmation_phrase: confirmationPhrase } : {}),
  };
}
