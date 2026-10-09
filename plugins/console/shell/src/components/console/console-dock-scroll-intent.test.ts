import { describe, expect, it } from "vitest";

import {
  advanceScrollIntent,
  advanceUserScrollIntent,
  emptyScrollIntent,
} from "./console-dock-scroll-intent";

describe("user scroll compaction", () => {
  it("does not expand for end-of-page correction during a downward gesture", () => {
    const intent = { distance: 400, startedAt: 1000, lastAt: 1300 };
    expect(advanceUserScrollIntent(intent, -80, 1350, 1).expand).toBe(false);
    expect(advanceUserScrollIntent(intent, -80, 1350, 0).expand).toBe(false);
    expect(advanceUserScrollIntent(intent, -80, 1350, -1).expand).toBe(true);
  });
  it("requires sustained distance and time, resets after a pause, and expands on upward intent", () => {
    const single = advanceScrollIntent(emptyScrollIntent, 800, 1000);
    expect(single.compact).toBe(false);
    const sustained = advanceScrollIntent(single.intent, 80, 1300);
    expect(sustained.compact).toBe(true);
    const upward = advanceScrollIntent(sustained.intent, -20, 1400);
    expect(upward.expand).toBe(true);
    expect(upward.intent).toEqual(emptyScrollIntent);
    const isolated = advanceScrollIntent(single.intent, 20, 2000);
    expect(isolated.compact).toBe(false);
    expect(isolated.intent.distance).toBe(20);
  });

  it("accumulates small upward movements without treating alternating jitter as descent", () => {
    let intent = emptyScrollIntent;
    let expanded = false;
    for (let index = 0; index < 5; index += 1) {
      const next = advanceScrollIntent(intent, -4, 1000 + index * 60);
      ({ intent } = next);
      expanded ||= next.expand;
    }
    expect(expanded).toBe(true);
    intent = emptyScrollIntent;
    for (let index = 0; index < 50; index += 1) {
      const next = advanceScrollIntent(
        intent,
        index % 2 === 0 ? 10 : -10,
        2000 + index * 30
      );
      ({ intent } = next);
      expect(next.compact).toBe(false);
    }
  });
});
