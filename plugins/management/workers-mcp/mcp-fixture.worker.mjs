import { create } from "../crates/lenso-management-http/src/workers/mcp.mjs";

export default {
  async fetch(request) {
    const packet = await request.json();
    const adapter = create(
      null,
      { run: (work) => work() },
      { profile: "read-only" }
    );
    const result = await adapter.handle(packet, async ({ action }) =>
      action === "catalog"
        ? {
            entries: [
              {
                capability: "example.ops-state@2",
                description: "Read selected state",
                effect: "read",
                id: "state.read",
                input_schema_json:
                  '{"type":"object","additionalProperties":false,"properties":{}}',
                operation: "read",
                requires_approval: false,
                target_instance: "example.ops-state/primary",
                version: "2.0.0",
              },
            ],
          }
        : { result_json: '{"value":47}', state: "succeeded" }
    );
    return Response.json(result);
  },
};
