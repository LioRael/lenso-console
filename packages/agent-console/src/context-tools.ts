import type { WorkspaceServices } from "@lenso/console-sdk/client";
import {
  consolePageOperationContextSchema,
  type ConsolePageDescriptor,
} from "@lenso/console-sdk/protocol";
import { z } from "zod";

const name = "console_page_operation_context";
const querySchema = z.strictObject({
  service: z.string().min(1).max(128),
  operation: z.string().min(1).max(128).optional(),
  offset: z.number().int().min(0).max(10000).optional(),
  limit: z.number().int().min(1).max(16).optional(),
});

/** The host resolves the current page from verified Agent identity/project admission, never model input. */
export interface ConsoleAgentPage {
  scopeKey: string;
  application: string;
  mount: Pick<
    ConsolePageDescriptor,
    "id" | "revision" | "implementationId" | "owner" | "requirements"
  >;
  services: WorkspaceServices;
}
function reject(code = "operation-failed"): never {
  throw Object.assign(new Error("Console operation context is unavailable."), {
    code,
  });
}

const fingerprint = async (selected: ConsoleAgentPage) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([
            selected.scopeKey,
            selected.application,
            selected.mount.id,
            selected.mount.revision,
            selected.mount.implementationId,
            selected.mount.owner.instance,
          ])
        )
      )
    )
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** Structural adapter for lenso-agent ToolSource (b1e7a371); no Agent runtime or model is installed. */
export function createConsoleOperationContextTools<C, Identity>(options: {
  resolve(
    context: C,
    identity: Identity,
    signal: AbortSignal
  ): Promise<ConsoleAgentPage | undefined>;
}) {
  async function page(context: C, identity: Identity, signal: AbortSignal) {
    signal.throwIfAborted();
    const resolved = await options.resolve(context, identity, signal);
    signal.throwIfAborted();
    if (
      !resolved?.scopeKey ||
      !resolved.application ||
      !resolved.services.inspect
    ) {
      reject("forbidden-operation");
    }
    return resolved;
  }
  const definition = (selected: ConsoleAgentPage) => ({
    name,
    description:
      "Inspect the authenticated current page's admitted operation, safe source reference, measured Runtime generation and bounded failure references. Declarations are unverified; unavailable history is not empty history.",
    inputSchema: z.toJSONSchema(querySchema),
    target: {
      application: selected.application,
      instance: selected.mount.owner.instance,
      plugin: "console",
      operation: "workspace.inspect",
    },
    effect: "read" as const,
    confirmation: false,
  });
  const validate = (input: unknown, selected: ConsoleAgentPage) => {
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) {
      reject("invalid-input");
    }
    const requirement = selected.mount.requirements.find(
      (entry) => entry.service_id === parsed.data.service && entry.available
    );
    if (
      !requirement ||
      (parsed.data.operation &&
        !requirement.operations.includes(parsed.data.operation))
    ) {
      reject("unknown-operation");
    }
    return parsed.data;
  };
  type Prepared = {
    definition: ReturnType<typeof definition>;
    input: unknown;
    precondition: string | null;
  };
  const source = {
    tools: [name] as readonly string[],
    async catalog(context: C, identity: Identity, signal: AbortSignal) {
      const selected = await page(context, identity, signal);
      return [definition(selected)];
    },
    async prepare(
      tool: string,
      input: unknown,
      context: C,
      identity: Identity,
      signal: AbortSignal
    ): Promise<Prepared> {
      if (tool !== name) {
        reject("unknown-operation");
      }
      const selected = await page(context, identity, signal);
      return {
        definition: definition(selected),
        input: validate(input, selected),
        precondition: await fingerprint(selected),
      };
    },
    async invoke(
      prepared: Prepared,
      context: C,
      identity: Identity,
      signal: AbortSignal,
      _confirmed: boolean
    ) {
      try {
        const selected = await page(context, identity, signal);
        if (
          JSON.stringify(prepared.definition) !==
            JSON.stringify(definition(selected)) ||
          prepared.precondition !== (await fingerprint(selected))
        ) {
          reject("precondition-conflict");
        }
        const query = validate(prepared.input, selected);
        const result = consolePageOperationContextSchema.parse(
          await selected.services.inspect!(
            query.service,
            {
              ...(query.operation === undefined
                ? {}
                : { operation: query.operation }),
              ...(query.offset === undefined ? {} : { offset: query.offset }),
              limit: query.limit ?? 8,
            },
            { signal }
          )
        );
        if (
          new TextEncoder().encode(JSON.stringify(result)).byteLength > 262144
        ) {
          reject("output-budget");
        }
        const current = await page(context, identity, signal);
        if ((await fingerprint(current)) !== prepared.precondition) {
          reject("precondition-conflict");
        }
        if (
          result.page.mountId !== current.mount.id ||
          result.page.revision !== current.mount.revision ||
          result.page.implementationId !== current.mount.implementationId ||
          result.page.ownerInstance !== current.mount.owner.instance
        ) {
          reject("precondition-conflict");
        }
        return result;
      } catch {
        signal.throwIfAborted();
        reject();
      }
    },
    /** AgentProfile.context: page references only; detailed facts remain an on-demand tool read. */
    async context(context: C, identity: Identity, signal: AbortSignal) {
      const selected = await page(context, identity, signal);
      return [
        {
          source: "console.page",
          text: JSON.stringify({
            kind: "untrusted-reference-data",
            mountId: selected.mount.id,
            revision: selected.mount.revision,
            implementationId: selected.mount.implementationId,
            services: selected.mount.requirements
              .filter((entry) => entry.available)
              .slice(0, 16)
              .map((entry) => entry.service_id),
            inspectTool: name,
          }),
        },
      ];
    },
  };
  return source;
}

/** Extend an existing AgentProfile without changing its old tool aliases or context source. */
export function registerConsoleOperationContext<C, Identity>(
  profile: {
    id: string;
    instructions: string;
    tools: readonly string[];
    context?: (
      context: C,
      identity: Identity,
      signal: AbortSignal
    ) => Promise<readonly { source: string; text: string }[]>;
  },
  source: ReturnType<typeof createConsoleOperationContextTools<C, Identity>>
) {
  return {
    ...profile,
    tools: [...new Set([...profile.tools, ...source.tools])],
    async context(context: C, identity: Identity, signal: AbortSignal) {
      const existing =
        (await profile.context?.(context, identity, signal)) ?? [];
      const current = await source.context(context, identity, signal);
      signal.throwIfAborted();
      return [...existing, ...current];
    },
  };
}
