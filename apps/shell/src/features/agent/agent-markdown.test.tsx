import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentMarkdown } from "./agent-markdown";

describe("AgentMarkdown", () => {
  it("renders agent output as Markdown without rendering raw HTML", () => {
    const output = renderToStaticMarkup(
      <AgentMarkdown>
        {
          "## Result\n\n中文（**重点**），包含 [文档](https://example.com) 与 `code`.\n\n- one\n- two\n\n<script>alert('no')</script>"
        }
      </AgentMarkdown>
    );

    expect(output).toContain("<h2");
    expect(output).toContain('data-streamdown="strong"');
    expect(output).toContain('data-streamdown="link"');
    expect(output).toContain("<code");
    expect(output).toContain("<ul");
    expect(output).not.toContain("<script");
    expect(output).not.toContain("alert('no')");
  });

  it("uses streaming mode only for an active answer", () => {
    const output = renderToStaticMarkup(
      <AgentMarkdown streaming>**Working</AgentMarkdown>
    );

    expect(output).toContain('data-streamdown="strong"');
    expect(output).toContain("Working");
  });
});
