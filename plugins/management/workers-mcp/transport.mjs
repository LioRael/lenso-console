import {
  createMcpHandler,
  McpServer,
  fromJsonSchema,
} from "@modelcontextprotocol/server";

const MAX_BODY = 262_144;
const stable = (value) => {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  }
  return value;
};
async function alias(entry) {
  const schema = JSON.parse(entry.input_schema_json);
  if (schema?.type !== "object" || schema.additionalProperties !== false) {
    throw new Error("invalid_entry_schema");
  }
  const tuple = [
    entry.id,
    entry.version,
    entry.capability,
    entry.operation,
    entry.target_instance,
    stable(schema),
    entry.effect,
    entry.requires_approval,
  ];
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(tuple))
  );
  return `management__${Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  )
    .join("")
    .slice(0, 48)}`;
}
const result = (value, isError = false) => ({
  content: [{ text: JSON.stringify(value), type: "text" }],
  isError,
});
async function boundedBody(response) {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > 1_048_576) {
        await reader.cancel();
        throw new Error("response_limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

// This is a private protocol adapter: the callback dispatches only the bound Role,
// with the already authenticated Rust context. It receives no credentials or env.
export function create(_binding, scope, configuration) {
  if (
    typeof scope?.run !== "function" ||
    !["read-only", "approved-writes"].includes(configuration?.profile) ||
    Object.keys(configuration).some((key) => key !== "profile")
  ) {
    throw new Error("invalid_mcp_profile");
  }
  return Object.freeze({
    async handle(packet, dispatch) {
      return scope.run(async () => {
        if (
          typeof dispatch !== "function" ||
          typeof packet?.url !== "string" ||
          !Array.isArray(packet.headers) ||
          !["POST", "GET", "DELETE"].includes(packet.method) ||
          typeof packet.body !== "string" ||
          new TextEncoder().encode(packet.body).byteLength > MAX_BODY
        ) {
          throw new Error("invalid_mcp_request");
        }
        const catalog = async () => {
          const response = await dispatch({ action: "catalog" });
          if (response.error) {
            throw new Error("management_unavailable");
          }
          return response.entries.filter(
            (entry) =>
              entry.effect === "read" ||
              (configuration.profile === "approved-writes" &&
                entry.effect === "write" &&
                entry.requires_approval)
          );
        };
        // Official SDK instance and transport are fresh for every request. There is no
        // process/session credential cache or global authority state.
        const handler = createMcpHandler(
          async () => {
            const server = new McpServer({
              name: "lenso-management",
              version: "0.1.0",
            });
            for (const entry of await catalog()) {
              const name = await alias(entry);
              const schema = {
                additionalProperties: false,
                properties: {
                  expected_revision: { type: ["string", "null"] },
                  idempotency_key: { maxLength: 128, type: ["string", "null"] },
                  input: JSON.parse(entry.input_schema_json),
                },
                required: ["input", "expected_revision", "idempotency_key"],
                type: "object",
              };
              server.registerTool(
                name,
                {
                  annotations: {
                    destructiveHint: entry.effect === "write",
                    openWorldHint: false,
                    readOnlyHint: entry.effect === "read",
                  },
                  description: entry.description,
                  inputSchema: fromJsonSchema(schema),
                },
                async (parameters) => {
                  const fresh = await catalog();
                  let current;
                  for (const candidate of fresh) {
                    if ((await alias(candidate)) === name) {
                      current = candidate;
                      break;
                    }
                  }
                  if (!current) {
                    return result({ code: "tool_unavailable" }, true);
                  }
                  const reply = await dispatch({
                    action: "invoke",
                    request: {
                      entry_id: current.id,
                      expected_revision: parameters.expected_revision,
                      idempotency_key: parameters.idempotency_key,
                      input_json: JSON.stringify(parameters.input),
                      version: current.version,
                    },
                  });
                  return result(reply, Boolean(reply.error));
                }
              );
            }
            if (configuration.profile === "approved-writes") {
              server.registerTool(
                "management__status",
                {
                  description:
                    "Query an accepted operation without replaying its write",
                  inputSchema: fromJsonSchema({
                    type: "object",
                    properties: {
                      operation_id: {
                        type: "string",
                        minLength: 1,
                        maxLength: 128,
                      },
                    },
                    required: ["operation_id"],
                    additionalProperties: false,
                  }),
                  annotations: { readOnlyHint: true, openWorldHint: false },
                },
                async ({ operation_id }) => {
                  const reply = await dispatch({
                    action: "status",
                    request: { operation_id },
                  });
                  return result(reply, Boolean(reply.error));
                }
              );
            }
            return server;
          },
          {
            keepAliveMs: 0,
            legacy: "stateless",
            maxRequestBodySize: MAX_BODY,
            maxSubscriptions: 0,
            responseMode: "auto",
          }
        );
        try {
          const request = new Request(packet.url, {
            headers: packet.headers,
            method: packet.method,
            ...(packet.method === "POST" ? { body: packet.body } : {}),
          });
          const response = await handler.fetch(request);
          return {
            body: await boundedBody(response),
            headers: Array.from(response.headers.entries()).filter(([name]) =>
              ["content-type", "allow", "mcp-protocol-version"].includes(name)
            ),
            status: response.status,
          };
        } finally {
          await handler.close();
        }
      });
    },
  });
}
export { alias };
