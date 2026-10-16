import { expect, test } from "bun:test";

import type { Browser } from "playwright";

import {
  parseSessionRenewalStatus,
  sessionRenewalDue,
} from "../src/session-renewal";
// Stops expiry/cap bypass and premature writes; deadline hints never authorize anything.
test("renew only a live near-expiry session inside the server's idle and absolute bounds", () => {
  const s = {
    subjectId: "synthetic",
    serverNow: 100_000,
    expiresAt: 120_000,
    absoluteExpiresAt: 900_000,
    renewAfterAt: 0,
  };
  expect(sessionRenewalDue(parseSessionRenewalStatus(s))).toBe(true);
  for (const value of [
    { ...s, expiresAt: 200_000 },
    { ...s, renewAfterAt: 110_000 },
    { ...s, expiresAt: 100_000 },
    { ...s, absoluteExpiresAt: 120_000 },
  ]) {
    expect(sessionRenewalDue(value)).toBe(false);
  }
  expect(() =>
    parseSessionRenewalStatus({ ...s, expiresAt: "130000" })
  ).toThrow();
});

type RenewalFixture = {
  state: {
    status: number;
    renew: number;
    unavailable: number;
    expiry: number;
    scroll: number;
    denied: boolean;
  };
  close(): void;
  hide(value: boolean): void;
  controller: AbortController;
};
// Deadline-only coverage above cannot detect non-bubbling DOM scroll events.
// Browser clocks keep hour-long deadlines deterministic without changing policy.
async function renewalPage(browser: Pick<Browser, "newPage">) {
  const page = await browser.newPage();
  await page.clock.install({ time: new Date(1_700_000_000_000) });
  await page.setContent(
    '<div id="pane" style="height:50px;overflow:auto"><div style="height:5000px">Synthetic scroll pane</div></div>'
  );
  const source = await Bun.file(
    new URL("../src/session-renewal.ts", import.meta.url)
  ).text();
  const script = new Bun.Transpiler({ loader: "ts" })
    .transformSync(source)
    .replaceAll(/\bexport /g, "");
  await page.addScriptTag({
    content: `${script}\nglobalThis.startSessionRenewal = startSessionRenewal;`,
  });
  await page.evaluate(() => {
    let hidden = false;
    Object.defineProperty(document, "visibilityState", {
      get: () => (hidden ? "hidden" : "visible"),
      configurable: true,
    });
    const fixture = globalThis as unknown as RenewalFixture & {
      startSessionRenewal(options: {
        status(): Promise<unknown>;
        renew(): Promise<void>;
        unavailable(): void;
        signal: AbortSignal;
      }): () => void;
    };
    const state = {
      status: 0,
      renew: 0,
      unavailable: 0,
      expiry: Date.now() + 3_600_000,
      scroll: 0,
      denied: false,
    };
    const controller = new AbortController();
    fixture.state = state;
    fixture.controller = controller;
    fixture.hide = (value) => {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    document
      .getElementById("pane")!
      .addEventListener("scroll", () => (state.scroll += 1));
    fixture.close = fixture.startSessionRenewal({
      signal: controller.signal,
      async status() {
        state.status += 1;
        if (state.denied) {
          throw new Error("Synthetic authoritative rejection");
        }
        return {
          subjectId: "synthetic",
          serverNow: Date.now(),
          expiresAt: state.expiry,
          absoluteExpiresAt: 1_700_000_000_000 + 86_400_000,
          renewAfterAt: 1_700_000_000_000 + 60_000,
        };
      },
      async renew() {
        state.renew += 1;
        state.expiry = Date.now() + 3_600_000;
      },
      unavailable() {
        state.unavailable += 1;
      },
    });
  });
  return {
    page,
    state: () =>
      page.evaluate(() => (globalThis as unknown as RenewalFixture).state),
    scroll: () =>
      page.evaluate(() => {
        const pane = document.getElementById("pane")!;
        pane.scrollTop += 10;
        // Native element scroll does not bubble; dispatch keeps virtual-clock ticks deterministic.
        pane.dispatchEvent(new Event("scroll"));
      }),
  };
}
async function isolatedBrowser() {
  const { chromium } = await import("playwright");
  const executablePath = process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
}

test("nested scroll renews an active tab and cleanup cannot affect another tab", async () => {
  const browser = await isolatedBrowser();
  try {
    const context = await browser.newContext();
    const active = await renewalPage(context),
      closed = await renewalPage(context);
    await closed.page.evaluate(() => {
      (globalThis as unknown as RenewalFixture).close();
    });
    const baseline = await closed.state();
    for (let minute = 0; minute < 59; minute += 1) {
      await active.scroll();
      await closed.scroll();
      await active.page.clock.runFor(60_000);
    }
    const activeState = await active.state();
    expect(activeState.scroll).toBeGreaterThan(50);
    expect(await active.state()).toMatchObject({
      status: 3,
      renew: 1,
      unavailable: 0,
    });
    expect(await closed.state()).toMatchObject({
      status: baseline.status,
      renew: baseline.renew,
      unavailable: baseline.unavailable,
    });
    await active.page.evaluate(() => {
      (globalThis as unknown as RenewalFixture).controller.abort();
    });
    const aborted = await active.state();
    for (let minute = 0; minute < 60; minute += 1) {
      await active.scroll();
      await active.page.clock.runFor(60_000);
    }
    expect(await active.state()).toMatchObject({
      status: aborted.status,
      renew: aborted.renew,
      unavailable: aborted.unavailable,
    });
  } finally {
    await browser.close();
  }
}, 30_000);

test("activity resumes after an idle timer stops, while hidden panes never renew", async () => {
  const browser = await isolatedBrowser();
  try {
    const fixture = await renewalPage(browser);
    await fixture.page.clock.runFor(59 * 60_000);
    expect(await fixture.state()).toMatchObject({ status: 1, renew: 0 });
    await fixture.page.evaluate(() => {
      (globalThis as unknown as RenewalFixture).hide(true);
    });
    await fixture.scroll();
    await fixture.page.clock.runFor(1000);
    expect(await fixture.state()).toMatchObject({ status: 1, renew: 0 });
    await fixture.page.evaluate(() => {
      (globalThis as unknown as RenewalFixture).hide(false);
    });
    await fixture.page.clock.runFor(1000);
    expect(await fixture.state()).toMatchObject({
      status: 3,
      renew: 1,
      unavailable: 0,
    });
  } finally {
    await browser.close();
  }
}, 30_000);

test("resuming nested activity cannot renew expired or authoritatively rejected sessions", async () => {
  const browser = await isolatedBrowser();
  try {
    const denied = await renewalPage(browser),
      expired = await renewalPage(browser);
    await expired.page.clock.runFor(60 * 60_000 + 1000);
    await expired.scroll();
    await expired.page.clock.runFor(1000);
    const expiredState = await expired.state();
    expect(expiredState.renew).toBe(0);
    expect(expiredState.status).toBeGreaterThanOrEqual(2);
    expect(expiredState.unavailable).toBeGreaterThanOrEqual(1);
    await denied.page.evaluate(() => {
      (globalThis as unknown as RenewalFixture).state.denied = true;
    });
    await denied.page.clock.runFor(59 * 60_000);
    await denied.scroll();
    await denied.page.clock.runFor(1000);
    const deniedState = await denied.state();
    expect(deniedState.renew).toBe(0);
    expect(deniedState.status).toBeGreaterThanOrEqual(2);
    expect(deniedState.unavailable).toBeGreaterThanOrEqual(1);
  } finally {
    await browser.close();
  }
}, 30_000);
