import type {
  AdministrationClient,
  AdministrationInputs,
  AdministrationMethod,
  AdministrationOutputs,
  CredentialDelivery,
} from "@lenso/auth-console/client";
import type { PageProps } from "@lenso/console-sdk";

/** Host-supplied SDK services and protected credential channel, never direct owner imports. */
export function administrationClient(
  services: PageProps["services"],
  credentials: PageProps["credentials"],
  signal: AbortSignal
): AdministrationClient {
  return {
    invoke<M extends AdministrationMethod>(
      method: M,
      input: AdministrationInputs[M],
      options?: { signal?: AbortSignal }
    ) {
      return services.invoke<AdministrationInputs[M], AdministrationOutputs[M]>(
        "administration",
        method,
        input,
        options
      );
    },
    async issueToken(input) {
      if (!credentials) {
        throw new Error("Credential issuance is unavailable.");
      }
      return (await credentials.issue(
        {
          requestedScopes: [...input.scopes],
          expiresAt: input.expiresAt,
          requestId: input.requestId,
        },
        { signal }
      )) as CredentialDelivery;
    },
    async rotateToken(input) {
      if (!credentials) {
        throw new Error("Credential rotation is unavailable.");
      }
      return (await credentials.rotate(input, {
        signal,
      })) as CredentialDelivery;
    },
  };
}
