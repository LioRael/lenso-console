import { definePlugin } from "@lenso/bun-plugin";
import { Contribution, type ContributionProvider } from "./contribution.ts";
import { WorkspaceService, type WorkspaceServiceProvider, type SubscribeResponse } from "./workspace-service.ts";

const encode = (value: unknown) => btoa(JSON.stringify(value));
const statistics = { subscribeCalls: 0, opened: 0, denied: 0, cancelled: 0, terminal: 0, messages: 0 };
const declaration = { service_id: "events", capability_id: "example.console.stream-fixture@1", descriptor_version: "1.0.0" };

export default definePlugin({
  provides: [Contribution, WorkspaceService],
  create(): ContributionProvider & WorkspaceServiceProvider {
    return {
      async describe_contribution() {
        return { ok: true, value: {
          workspace_id: "stream-fixture", title: "Stream fixture", revision: "fixture-v1",
          module: "workspace.mjs", styles: [], navigation: { label: "Stream fixture", items: [] },
          assets: [{ path: "workspace.mjs", media_type: "text/javascript; charset=utf-8", content_base64: btoa("export function createWorkspace() { return { dispose() {} }; }") }],
          requirements: [{ ...declaration, operations: ["watch", "status"], required: true, source: "owner" }],
        } };
      },
      async describe_exports() {
        return { ok: true, value: { adapter_revision: "fixture-v1", services: [{ ...declaration,
          operations: [{ name: "watch", interaction: "stream" }, { name: "status", interaction: "request" }],
        }] } };
      },
      async invoke(_context, request) {
        if (request.service_id !== "events" || request.operation !== "status") return { ok: false, error: { kind: "domain", error: "unknown_operation" } };
        return { ok: true, value: { body_base64: encode(statistics), outcome: "success" } };
      },
      async subscribe(_context, request) {
        statistics.subscribeCalls += 1;
        if (request.service_id !== "events" || request.operation !== "watch") return { ok: false, error: { kind: "domain", error: "unknown_operation" } };
        let input: { id?: unknown; mode?: unknown };
        try { input = JSON.parse(atob(request.body_base64)); }
        catch { return { ok: false, error: { kind: "domain", error: "codec_mismatch" } }; }
        if (typeof input.id !== "string") return { ok: false, error: { kind: "domain", error: "codec_mismatch" } };
        if (input.id !== "42") { statistics.denied += 1; return { ok: false, error: { kind: "domain", error: "denied" } }; }
        if (input.mode !== "finite" && input.mode !== "cancel") return { ok: false, error: { kind: "domain", error: "codec_mismatch" } };
        statistics.opened += 1;
        let sequence = 0;
        let closed = false;
        let resolvePending: ((event: { kind: "terminal"; outcome: { ok: true } }) => void) | undefined;
        return { ok: true, value: {
          async send() { throw new Error("server-output stream does not accept input"); },
          async closeSend() {},
          cancel() {
            if (closed) return;
            closed = true;
            statistics.cancelled += 1;
            resolvePending?.({ kind: "terminal", outcome: { ok: true } });
          },
          async receive() {
            if (closed) return { kind: "terminal" as const, outcome: { ok: true as const } };
            const limit = input.mode === "finite" ? 2 : 1;
            if (sequence < limit) {
              const message: SubscribeResponse = { sequence: String(sequence), outcome: "item", body_base64: encode({ index: sequence }) };
              sequence += 1;
              statistics.messages += 1;
              return { kind: "message" as const, message };
            }
            if (input.mode === "finite") {
              closed = true;
              statistics.terminal += 1;
              return { kind: "terminal" as const, outcome: { ok: true as const } };
            }
            return await new Promise<{ kind: "terminal"; outcome: { ok: true } }>((resolve) => { resolvePending = resolve; });
          },
        } };
      },
    };
  },
});
