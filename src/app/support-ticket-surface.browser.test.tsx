import type { SurfaceOperationRequest } from "@lenso/console-module-api";
import { ConsoleModuleProvider, type ConsoleClient } from "@lenso/console-ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";

import {
  SUPPORT_TICKET_OPERATION_IDS,
  SupportTicketsPage,
} from "../../packages/support-ticket-console/src";

const roots: ReturnType<typeof createRoot>[] = [];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

describe("Support Ticket Module Surface browser contract", () => {
  test("lists, updates, and closes tickets through the generated client", async () => {
    const operations: string[] = [];
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <ConsoleModuleProvider client={fakeClient(operations)}>
          <SupportTicketsPage />
        </ConsoleModuleProvider>
      );
    });

    const title = host.querySelector<HTMLInputElement>(
      "input[aria-label='Title for ticket-1']"
    );
    expect(title).not.toBeNull();
    if (!title) {
      throw new Error("ticket title input was not rendered");
    }
    expect(title.value).toBe("Cannot invite a teammate");
    const newTitle = host.querySelector<HTMLInputElement>(
      "#support-ticket-title"
    );
    expect(newTitle).not.toBeNull();
    if (!newTitle) {
      throw new Error("new ticket title input was not rendered");
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(newTitle, "A newly created ticket");
      newTitle.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const create = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Create ticket"
    );
    expect(create).not.toBeUndefined();
    await act(async () => {
      create?.click();
    });

    const updatedTitle = host.querySelector<HTMLInputElement>(
      "input[aria-label='Title for ticket-1']"
    );
    expect(updatedTitle).not.toBeNull();
    if (!updatedTitle) {
      throw new Error("ticket title input was not rendered after create");
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(updatedTitle, "Cannot invite a teammate (updated)");
      updatedTitle.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Save"
    );
    expect(save).not.toBeUndefined();
    await act(async () => {
      save?.click();
    });
    const close = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Close"
    );
    expect(close).not.toBeUndefined();
    await act(async () => {
      close?.click();
    });

    expect(operations).toEqual([
      SUPPORT_TICKET_OPERATION_IDS.list,
      SUPPORT_TICKET_OPERATION_IDS.create,
      SUPPORT_TICKET_OPERATION_IDS.list,
      SUPPORT_TICKET_OPERATION_IDS.update,
      SUPPORT_TICKET_OPERATION_IDS.list,
      SUPPORT_TICKET_OPERATION_IDS.close,
      SUPPORT_TICKET_OPERATION_IDS.list,
    ]);
  });
});

function fakeClient(operations: string[]): ConsoleClient {
  const digest =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `sha256:${string}`;
  const context = {
    capabilities: [
      "console.module.business.read",
      "console.module.business.write",
    ],
    callerModuleId: "support/tickets",
    delegatedActorSubject: "operator-1",
    delegatedAuthorityDigest: digest,
    environmentId: "production",
    serviceId: "support-api",
    systemId: "support-desk",
    targetServicePrincipal: "svc.support-api",
  };
  return {
    capabilities: { has: () => true, list: () => context.capabilities },
    command: async () => {
      throw new Error("unused");
    },
    identity: {
      moduleId: "support/tickets",
      moduleReleaseDigest: digest,
      uiArtifactDigest: digest,
    },
    inventory: async () => {
      throw new Error("unused");
    },
    managedServiceContext: context,
    navigate: () => undefined,
    query: async () => {
      throw new Error("unused");
    },
    readConfig: async () => {
      throw new Error("unused");
    },
    resolveActionContributions: async () => {
      throw new Error("unused");
    },
    surfaceApi: {
      invoke: async <Input, Output>(
        request: SurfaceOperationRequest<Input>
      ) => {
        operations.push(request.operationId);
        const ticket = {
          assignee: "support-lead",
          created_at: "2026-06-20T00:00:00Z",
          id: "ticket-1",
          priority: "normal",
          status: "open",
          title: "Cannot invite a teammate",
          updated_at: "2026-06-20T00:00:00Z",
        };
        return {
          contractDigest: request.contractDigest,
          moduleId: request.moduleId,
          operationId: request.operationId,
          output: (request.operationId === SUPPORT_TICKET_OPERATION_IDS.list
            ? { next_cursor: null, records: [ticket] }
            : { ticket }) as Output,
          protocol: "lenso.console-surface-gateway.v1",
          requestContext: request.requestContext,
        };
      },
    },
    writeConfig: async () => {
      throw new Error("unused");
    },
  };
}
