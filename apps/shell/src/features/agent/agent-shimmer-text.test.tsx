import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentShimmerText } from "./agent-shimmer-text";

describe("AgentShimmerText", () => {
  it("shimmers only while active", () => {
    expect(
      renderToStaticMarkup(
        <AgentShimmerText active className="status">
          Working…
        </AgentShimmerText>
      )
    ).toContain('class="status ');
    expect(
      renderToStaticMarkup(
        <AgentShimmerText active className="status">
          Working…
        </AgentShimmerText>
      )
    ).toContain('aria-hidden="true"');

    expect(
      renderToStaticMarkup(
        <AgentShimmerText active={false}>Completed</AgentShimmerText>
      )
    ).toBe("<span>Completed</span>");
  });
});
