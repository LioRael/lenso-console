import { describe, expect, it } from "vitest";

import { hasAgentConversation } from "./agent-page-state";

describe("Agent page state", () => {
  it("keeps a canonical new-task route in the empty composer state", () => {
    expect(hasAgentConversation("new-task", 0)).toBe(false);
  });

  it("recognizes persisted Sessions and newly submitted Turns", () => {
    expect(hasAgentConversation("session-1", 0)).toBe(true);
    expect(hasAgentConversation(undefined, 1)).toBe(true);
  });
});
