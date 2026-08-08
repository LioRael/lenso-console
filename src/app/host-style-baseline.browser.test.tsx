import { afterEach, describe, expect, it } from "vitest";

import "../styles.css";

const elements: HTMLElement[] = [];

afterEach(() => {
  for (const element of elements.splice(0)) {
    element.remove();
  }
});

describe("Console Host style baseline", () => {
  it("neutralizes native control chrome before component styles", () => {
    const button = document.createElement("button");
    const input = document.createElement("input");
    document.body.append(button, input);
    elements.push(button, input);

    const buttonStyle = getComputedStyle(button);
    const inputStyle = getComputedStyle(input);

    expect(buttonStyle.borderWidth).toBe("0px");
    expect(buttonStyle.padding).toBe("0px");
    expect(inputStyle.borderWidth).toBe("0px");
    expect(inputStyle.padding).toBe("0px");
  });
});
