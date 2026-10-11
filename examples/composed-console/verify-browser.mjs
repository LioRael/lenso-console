import assert from "node:assert/strict";

import { chromium } from "playwright";

const origin = process.env.COMPOSED_PREVIEW_URL ?? "http://127.0.0.1:5175";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  permissions: ["clipboard-read", "clipboard-write"],
  viewport: { height: 900, width: 1280 },
});
const errors = [];
const externalRequests = [];
page.on("request", (request) => {
  if (new URL(request.url()).origin !== new URL(origin).origin) {
    externalRequests.push(request.url());
  }
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400) {
    errors.push(`${response.status()} ${response.url()}`);
  }
});
const button = (name) => page.getByRole("button", { exact: true, name });
const link = (name) => page.getByRole("link", { exact: true, name });
const heading = (name) => page.getByRole("heading", { exact: true, name });
const selectOption = async (label, value) => {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { exact: true, name: value }).click();
};
const assertContextTravel = (samples, direction) => {
  assert.ok(
    new Set(samples.map((frame) => Math.round(frame.width))).size > 3,
    direction
  );
  assert.ok(
    samples.some((frame) => frame.opacity < 0.9),
    direction
  );
  assert.ok(
    samples.every(
      (frame) => frame.opacity === 1 || (frame.inert && !frame.hit)
    ),
    direction
  );
  assert.equal(samples.at(-1).opacity, 1);
  assert.equal(samples.at(-1).inert, false);
  console.log(
    `Context ${direction}: ${samples.length} physical frames, surface resize/content handoff`
  );
};
// Existing surface/anchor samples cannot catch readable or clickable content
// already occupying the target bounds while its physical wrapper is still small.
const startChoreographySamples = () =>
  page.evaluate(() => {
    window.choreographyFrames = [];
    const start = performance.now();
    // rAF runs before ResizeObserver and paint. A posted task observes the
    // committed frame, rather than a target layout that has not painted yet.
    const channel = new MessageChannel();
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must be serialized inside Playwright's browser realm, not hoisted into Node.
    const clipInsets = (content) => {
      const match = getComputedStyle(content).clipPath.match(
        /inset\(([^)]*?) round/u
      );
      const values = match?.[1].split(" ").map(Number.parseFloat);
      return (
        values && [
          values[0],
          values[1] ?? values[0],
          values[2] ?? values[0],
          values[3] ?? values[1] ?? values[0],
        ]
      );
    };
    const sample = () => {
      const dock = document.querySelector("[data-dashboard-dock]");
      const surface = dock?.querySelector("[data-dashboard-dock-surface]");
      const content = dock?.querySelector("[data-dashboard-dock-content]");
      if (surface && content) {
        const physical = surface.getBoundingClientRect();
        const target = dock.getBoundingClientRect();
        const foreground = content.getBoundingClientRect();
        const opacity = Number(getComputedStyle(content).opacity);
        const insets = clipInsets(content);
        const escapedHits = [];
        const prematureHits = [];
        for (const control of content.querySelectorAll("button, input, a")) {
          const r = control.getBoundingClientRect();
          if (
            opacity < 0.999 &&
            control.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            )
          ) {
            prematureHits.push(
              control.getAttribute("aria-label") ?? control.textContent
            );
          }
          for (const [x, y] of [
            [r.x + r.width / 2, r.y + r.height / 2],
            [r.x + 2, r.y + 2],
            [r.right - 2, r.bottom - 2],
          ]) {
            if (
              (x < physical.x - 1 ||
                x > physical.right + 1 ||
                y < physical.y - 1 ||
                y > physical.bottom + 1) &&
              control.contains(document.elementFromPoint(x, y))
            ) {
              escapedHits.push(
                control.getAttribute("aria-label") ?? control.textContent
              );
            }
          }
        }
        window.choreographyFrames.push({
          clip: insets && {
            bottom: foreground.bottom - insets[2],
            right: foreground.right - insets[1],
            x: foreground.x + insets[3],
            y: foreground.y + insets[0],
          },
          escapedHits,
          opacity,
          physical: physical.toJSON(),
          prematureHits,
          target: target.toJSON(),
        });
      }
      if (performance.now() - start < 380) {
        requestAnimationFrame(() => channel.port2.postMessage(null));
      } else {
        channel.port1.close();
        channel.port2.close();
      }
    };
    channel.port1.addEventListener("message", sample);
    channel.port1.start();
    requestAnimationFrame(() => channel.port2.postMessage(null));
  });
const checkChoreographySamples = async (label) => {
  await page.waitForTimeout(400);
  const frames = await page.evaluate(() => window.choreographyFrames);
  assert.ok(frames.length > 5, `${label}: actual animation frames required`);
  for (const frame of frames) {
    assert.deepEqual(frame.escapedHits, [], `${label}: hit outside wrapper`);
    assert.deepEqual(
      frame.prematureHits,
      [],
      `${label}: hit before presentation ready`
    );
    assert.ok(frame.clip, `${label}: mounted content needs a physical clip`);
    for (const edge of ["x", "y", "right", "bottom"]) {
      assert.ok(
        Math.abs(frame.clip[edge] - frame.physical[edge]) < 1.5,
        `${label}: visual and hit-test clip must follow surface ${edge}: ${JSON.stringify(frame)}`
      );
    }
    if (
      ["x", "y", "width", "height"].some(
        (key) => Math.abs(frame.target[key] - frame.physical[key]) > 1
      )
    ) {
      assert.ok(
        frame.opacity < 0.999,
        `${label}: content fully visible before wrapper arrived`
      );
    }
  }
  console.log(
    `Choreography ${label}: ${frames.length} rAF frames, clip/visibility/hit-test coordinated`
  );
};
const settleImmediateSurface = () =>
  page.evaluate(
    () =>
      // oxlint-disable-next-line promise/avoid-new -- Motion commits zero-duration layout projection on the browser frame queue; observe after two actual frames, not an arbitrary timer.
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
const navigate = async (label, path, title) => {
  await button("Expand Dock").click();
  await page
    .getByRole("dialog")
    .getByRole("link", { exact: true, name: label })
    .click();
  await page.waitForURL(`${origin}${path}`);
  await heading(title).first().waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  console.log(`Navigation: ${label} -> ${path}`);
};

try {
  await page.goto(origin);
  await heading("Dashboard").waitFor();
  const commandKey = (await page.evaluate(() =>
    /Mac|iPhone|iPad/u.test(navigator.platform)
  ))
    ? "Meta+k"
    : "Control+k";
  const commandInput = page.getByRole("searchbox", { name: "Search commands" });
  assert.equal(await button("Console navigation").count(), 0);
  const divider = page.locator('[data-dashboard-control="dock-divider"]');
  const dividerGeometry = await divider.boundingBox();
  const dockButtons = page
    .getByRole("navigation", { name: "Pinned navigation" })
    .getByRole("button");
  const preceding = await dockButtons
    .nth((await dockButtons.count()) - 2)
    .boundingBox();
  const expandGeometry = await button("Expand Dock").boundingBox();
  assert.ok(dividerGeometry.width > 0 && dividerGeometry.height > 0);
  assert.ok(dividerGeometry.x >= preceding.x + preceding.width);
  assert.ok(dividerGeometry.x + dividerGeometry.width <= expandGeometry.x);
  assert.equal(
    await divider.evaluate((node) => {
      const color = getComputedStyle(node).backgroundColor;
      return color !== "transparent" && color !== "rgba(0, 0, 0, 0)";
    }),
    true
  );
  const checkExpansion = async (position = "bottom") => {
    await page.waitForTimeout(300);
    const popup = page.getByRole("dialog", { name: "Console navigation" });
    await popup.waitFor();
    const dock = await page.locator(".dashboard-dock").boundingBox();
    const tray = await popup.boundingBox();
    assert.ok(
      Math.abs(dock.x - tray.x) < 1 && Math.abs(dock.y - tray.y) < 1,
      JSON.stringify({ dock, position, tray })
    );
    assert.ok(
      Math.abs(dock.width - tray.width) < 1 &&
        Math.abs(dock.height - tray.height) < 1
    );
    assert.equal(
      await popup.evaluate((node) => !!node.closest("[data-dashboard-dock]")),
      true
    );
    const edge = {
      bottom: page.viewportSize().height - tray.y - tray.height,
      left: tray.x,
      right: page.viewportSize().width - tray.x - tray.width,
      top: tray.y,
    }[position];
    assert.ok(Math.abs(edge - (position === "top" ? 76 : 20)) < 2);
    assert.ok(tray.x >= 0 && tray.x + tray.width <= page.viewportSize().width);
    assert.ok(
      tray.y >= 0 && tray.y + tray.height <= page.viewportSize().height
    );
    assert.equal(
      await page.locator(".dashboard-dock").getAttribute("data-expanded"),
      "true"
    );
    assert.equal(await popup.getAttribute("aria-modal"), null);
    const destinations = await popup
      .getByRole("region", { exact: true, name: "Destinations" })
      .boundingBox();
    const quickControls = await popup
      .getByRole("region", { exact: true, name: "Quick controls" })
      .boundingBox();
    assert.ok(quickControls.y >= destinations.y + destinations.height);
    assert.equal(
      await popup
        .getByRole("region", { name: "Pinned navigation settings" })
        .count(),
      0
    );
    assert.equal(
      await popup
        .getByRole("button", { exact: true, name: "Reset navigation" })
        .count(),
      0
    );
    assert.ok(quickControls.x + quickControls.width <= tray.x + tray.width);
    for (const control of await popup
      .getByRole("region", { name: "Quick controls" })
      .getByRole("button")
      .all()) {
      assert.deepEqual(
        await control.evaluate((node) => {
          const r = node.getBoundingClientRect();
          return [6, r.width / 2, r.width - 6].flatMap((x) =>
            [6, r.height / 2, r.height - 6].flatMap((y) => {
              const hit = document.elementFromPoint(r.x + x, r.y + y);
              return node.contains(hit)
                ? []
                : [{ control: node.textContent, hit: hit?.outerHTML, x, y }];
            })
          );
        }),
        [],
        "Quick controls must not be covered, including their corners"
      );
    }
    assert.equal(
      await page
        .getByRole("textbox", { name: "Search navigation" })
        .evaluate((node) => node === document.activeElement),
      true
    );
    assert.equal(
      await button("Close navigation").evaluate((node) => {
        const r = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        );
      }),
      true
    );
  };
  // Outer-shell sampling misses a newly mounted row counter-projecting from
  // below the viewport, and a focus tooltip retaining that in-flight anchor.
  const checkCollapse = async (position) => {
    const expanded = await page
      .locator("[data-dashboard-dock-surface]")
      .boundingBox();
    await page.evaluate(() => {
      window.collapseFrames = [];
      const start = performance.now();
      const sample = () => {
        const control = document.querySelector(
          'button[aria-label="Expand Dock"]'
        );
        const surface = document.querySelector("[data-dashboard-dock-surface]");
        if (control) {
          window.collapseFrames.push({
            control: control.getBoundingClientRect().toJSON(),
            surface: surface.getBoundingClientRect().toJSON(),
          });
        }
        if (performance.now() - start < 400) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });
    await button("Close navigation").click();
    await page.waitForTimeout(450);
    const settled = await button("Expand Dock").boundingBox();
    const samples = await page.evaluate(() => window.collapseFrames);
    assert.ok(samples.length > 5);
    const edge = (rect) =>
      ({
        bottom: rect.y + rect.height,
        left: rect.x,
        right: rect.x + rect.width,
        top: rect.y,
      })[position];
    for (const { control, surface } of samples) {
      assert.ok(
        Math.abs(control.x - settled.x) < 1,
        `${position}: content x drift`
      );
      assert.ok(
        Math.abs(control.y - settled.y) < 1,
        `${position}: content y drift`
      );
      assert.ok(Math.abs(control.width - settled.width) < 1);
      assert.ok(Math.abs(control.height - settled.height) < 1);
      assert.ok(
        Math.abs(edge(surface) - edge(expanded)) < 2,
        `${position}: surface edge drift`
      );
    }
    const collapsed = samples.at(-1).surface;
    assert.ok(
      samples.some(
        ({ surface }) =>
          surface.width > collapsed.width + 2 &&
          surface.width < expanded.width - 2
      ),
      `${position}: surface must morph, not teleport`
    );
    // Keep the automatically restored focus, then exercise actual pointer hover.
    for (const trigger of ["focus", "hover"]) {
      if (trigger === "focus") {
        await page.keyboard.press("Tab");
        await button("Expand Dock").focus();
      } else {
        await page.mouse.move(0, 0);
        await button("Expand Dock").evaluate((node) => node.blur());
        await button("Expand Dock").hover();
      }
      const tooltip = page.getByRole("tooltip", {
        exact: true,
        name: "Expand Dock",
      });
      await tooltip.waitFor();
      await page.waitForTimeout(200);
      const tip = await tooltip.boundingBox();
      const target = await button("Expand Dock").boundingBox();
      const gap = {
        bottom: target.y - tip.y - tip.height,
        left: tip.x - target.x - target.width,
        right: target.x - tip.x - tip.width,
        top: tip.y - target.y - target.height,
      }[position];
      assert.ok(
        Math.abs(gap - 10) < 2,
        `${position}/${trigger}: tooltip gap ${gap}`
      );
      const alignment =
        position === "top" || position === "bottom"
          ? tip.x + tip.width / 2 - target.x - target.width / 2
          : tip.y + tip.height / 2 - target.y - target.height / 2;
      assert.ok(
        Math.abs(alignment) < 2,
        `${position}/${trigger}: tooltip anchor drift ${alignment}`
      );
      assert.ok(tip.x >= 0 && tip.x + tip.width <= page.viewportSize().width);
      assert.ok(tip.y >= 0 && tip.y + tip.height <= page.viewportSize().height);
    }
    console.log(
      `Collapse ${position}/${page.viewportSize().width}: ${samples.length} stationary content frames, focus/hover tooltip anchored`
    );
  };
  await button("Expand Dock").focus();
  await page.keyboard.press("Enter");
  await checkExpansion();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Expand Dock"
  );
  console.log(
    "Dock: grouped divider, no default corner duplicate, shared non-modal directory, search focus, Enter/Escape and focus restoration"
  );
  for (const position of ["top", "left", "right", "bottom"]) {
    await startChoreographySamples();
    await button("Expand Dock").click();
    await checkChoreographySamples(`open/${position}`);
    await startChoreographySamples();
    await button("Customize navigation").click();
    await checkChoreographySamples(`editor/${position}`);
    await button("Cancel").click();
    await startChoreographySamples();
    await button("Navigation settings").click();
    await checkChoreographySamples(`settings/${position}`);
    await selectOption("Dock position", position);
    await startChoreographySamples();
    await button("Save").click();
    await checkChoreographySamples(`back/${position}`);
    await page.getByRole("textbox", { name: "Search navigation" }).focus();
    await page.waitForTimeout(200);
    await checkExpansion(position);
    await startChoreographySamples();
    await checkCollapse(position);
    await checkChoreographySamples(`collapse/${position}`);
  }
  // A single save per position can miss the fractional-edge hit-test window
  // while a side settings panel rebases into the bottom launcher.
  for (let turn = 0; turn < 6; turn += 1) {
    await button("Expand Dock").click();
    await button("Navigation settings").click();
    await selectOption("Dock position", turn % 2 ? "bottom" : "right");
    await startChoreographySamples();
    await button("Save").click();
    await checkChoreographySamples(`repeated save/${turn}`);
    await page.keyboard.press("Escape");
  }
  // An adjacent-popup check cannot detect a teleport. Sample painted geometry.
  await page.evaluate(() => {
    const frames = [];
    window.dockFrames = frames;
    const sample = () => {
      const r = document
        .querySelector("[data-dashboard-dock-surface]")
        .getBoundingClientRect();
      frames.push({
        bottom: r.bottom,
        height: r.height,
        width: r.width,
      });
      if (frames.length < 90) {
        requestAnimationFrame(sample);
      }
    };
    document
      .querySelector(".dashboard-dock")
      .addEventListener("pointerdown", () => requestAnimationFrame(sample), {
        once: true,
      });
  });
  await button("Expand Dock").click();
  await page.waitForTimeout(360);
  const frames = await page.evaluate(() => window.dockFrames);
  assert.ok(frames.some((frame) => frame.width > 300 && frame.width < 590));
  assert.ok(frames.some((frame) => frame.height > 70 && frame.height < 400));
  assert.ok(frames.every((frame) => Math.abs(frame.bottom - 880) < 2));
  await page.getByRole("textbox", { name: "Search navigation" }).fill("Orders");
  assert.equal(await page.getByRole("dialog").getByRole("link").count(), 1);
  await button("Customize navigation").click();
  await button("Cancel").press("Escape");
  assert.equal(
    await button("Customize navigation").evaluate(
      (node) => node === document.activeElement
    ),
    true
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Search navigation" }).inputValue(),
    "Orders"
  );
  await button("Close navigation").click();
  await page.waitForTimeout(300);
  const reversalAnchor = await button("Expand Dock").boundingBox();
  await page.evaluate(() => {
    window.reversalFrames = [];
    const start = performance.now();
    const sample = () => {
      const node = document.querySelector(
        '.dashboard-dock-pane[data-present="true"] button[aria-label="Expand Dock"]'
      );
      if (node) {
        window.reversalFrames.push(node.getBoundingClientRect().toJSON());
      }
      if (performance.now() - start < 1500) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  for (let turn = 0; turn < 3; turn += 1) {
    await startChoreographySamples();
    await button("Expand Dock").click();
    await page.waitForTimeout(60);
    await page
      .locator('button[aria-label="Close navigation"]')
      .dispatchEvent("pointerdown");
    await page
      .locator('button[aria-label="Close navigation"]')
      .dispatchEvent("click", { detail: 1 });
    await page.waitForTimeout(60);
    await checkChoreographySamples(`rapid reversal/${turn}`);
  }
  const reversalFrames = await page.evaluate(() => window.reversalFrames);
  assert.ok(reversalFrames.length > 5);
  assert.ok(
    reversalFrames.every(
      (frame) =>
        Math.abs(frame.x - reversalAnchor.x) < 1 &&
        Math.abs(frame.y - reversalAnchor.y) < 1 &&
        Math.abs(frame.width - reversalAnchor.width) < 1 &&
        Math.abs(frame.height - reversalAnchor.height) < 1
    ),
    "Reversals must not project returning controls from the interrupted tray"
  );
  await button("Expand Dock").click();
  await checkExpansion();
  assert.equal(
    await page.getByRole("textbox", { name: "Search navigation" }).inputValue(),
    ""
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log(
    "Motion: intermediate geometry, fixed docking edge, repeated reversal, search and query reset"
  );
  const dashboardGeometry = await heading("Dashboard").boundingBox();
  await button("Start feedback mode").focus();
  await page.keyboard.press("Enter");
  await heading("Dashboard").click();
  const feedback =
    "Keep the sample-data notice visible while reviewing Dashboard.";
  await page.getByPlaceholder("What should change?").fill(feedback);
  await button("Add").click();
  await button("Copy feedback").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes(feedback));
  assert.ok(copied.includes("Dashboard"));
  assert.ok(copied.includes("h1"));
  console.log(`Agentation copied feedback:\n${copied}`);
  await button("Clear all").click();
  await button("Exit").focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await button("Start feedback mode").waitFor();
  assert.deepEqual(await heading("Dashboard").boundingBox(), dashboardGeometry);
  assert.equal(
    await button("Start feedback mode").evaluate((node) => {
      const r = node.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        node.contains(
          node
            .getRootNode()
            .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        )
      );
    }),
    true
  );
  console.log(
    "Agentation: keyboard open, heading annotation, clipboard export, clear/Escape, unchanged page geometry and unobstructed toolbar"
  );
  await button("Edit dashboard").click();
  await button("Add Auth information").click();
  await button("Save dashboard").click();
  await button("Edit dashboard").waitFor();
  assert.equal(
    await page
      .getByRole("region", { exact: true, name: "Auth information" })
      .count(),
    2
  );
  console.log("Dashboard: add widget and save");

  for (const realm of ["Workforce", "Customers"]) {
    const path = realm.toLowerCase();
    const destination = realm === "Workforce" ? "Workforce" : "Customer";
    await navigate(realm, `/${path}`, "Auth information");
    await navigate(`${destination} subjects`, `/${path}/subjects`, "Subjects");
    await navigate(`${destination} sessions`, `/${path}/sessions`, "Sessions");
    await button("Load more sessions").click();
    await link(`sample-${path}-3`).waitFor();
    await link(`sample-${path}-1`).click();
    await button("Revoke session").click();
    await page.keyboard.press("Escape");
    await button("Revoke session").waitFor();
    assert.equal(
      await button("Revoke session").evaluate(
        (node) => node === document.activeElement
      ),
      true
    );
    await page.keyboard.press("Enter");
    await button("Confirm revocation").click();
    await page.getByText("Session revoked.", { exact: true }).waitFor();
    await navigate(`${destination} sessions`, `/${path}/sessions`, "Sessions");
    await page.getByText("Revoked", { exact: true }).waitFor();
    console.log(
      `${realm}: pagination, detail, Escape/focus restore, keyboard reopen, revoke persists across navigation`
    );
  }

  await navigate("Plugins", "/plugins", "Plugin manager");
  await heading("sample-auth").waitFor();
  await button("Refresh catalog").click();
  await heading("sample-auth").waitFor();
  await navigate("Orders", "/orders", "Orders");
  // Launcher-only coverage cannot catch Command opening detached from the Dock,
  // losing text-entry/launcher focus, or discovering unsafe selection handlers.
  await page.getByLabel("Filter order IDs").fill("sample-order-1");
  await page.keyboard.press(commandKey);
  await commandInput.waitFor();
  assert.equal(
    await commandInput.evaluate((node) => node === document.activeElement),
    true
  );
  assert.equal(
    await commandInput.evaluate(
      (node) => !!node.closest("[data-dashboard-dock]")
    ),
    true
  );
  assert.equal(
    await page
      .getByRole("dialog", { name: "Command" })
      .getByRole("region", { name: "Dock presets" })
      .count(),
    1
  );
  assert.equal(await button("Archive selected orders").count(), 0);
  await commandInput.fill("Clear order filter");
  await commandInput.press("Enter");
  assert.equal(await page.getByLabel("Filter order IDs").inputValue(), "");
  await button("Expand Dock").click();
  const launcherInput = page.getByLabel("Search navigation");
  await launcherInput.fill("Orders");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Command /u })
    .click();
  await commandInput.fill("Default");
  await page.keyboard.press(commandKey);
  assert.equal(await commandInput.inputValue(), "Default");
  await commandInput.press("Escape");
  assert.equal(await launcherInput.inputValue(), "Orders");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await button("Sample preview").click();
  await page.getByRole("dialog", { name: "About sample preview" }).waitFor();
  await button("Sample preview").focus();
  await page.keyboard.press(commandKey);
  assert.equal(await commandInput.count(), 0);
  await page.keyboard.press("Escape");
  console.log(
    "Command: single preset, text-entry focus, scoped clear-filter, no archive discovery, launcher query restoration and innermost overlay priority"
  );
  // Source-only checks miss StyleX dropping a state declaration or inherited
  // text glyph metrics making a corner icon much smaller than Dock icons.
  const clear = button("Clear order filter");
  const clearBox = await clear.boundingBox();
  const ordersTabs = await page
    .getByRole("tablist", { name: "Orders" })
    .boundingBox();
  assert.ok(ordersTabs.height < clearBox.height);
  assert.ok(
    Math.abs(
      ordersTabs.y + ordersTabs.height / 2 - clearBox.y - clearBox.height / 2
    ) < 1
  );
  const glyph = await clear.locator("svg").boundingBox();
  assert.ok(
    glyph.width / clearBox.width >= 0.4 && glyph.width / clearBox.width <= 0.55
  );
  const ordersControl = page
    .getByRole("navigation", { name: "Pinned navigation" })
    .getByRole("button", { exact: true, name: "Orders" });
  const restingColor = await ordersControl.evaluate(
    (node) => getComputedStyle(node).backgroundColor
  );
  await ordersControl.hover();
  await page.waitForTimeout(200);
  const hoverColor = await ordersControl.evaluate(
    (node) => getComputedStyle(node).backgroundColor
  );
  assert.notEqual(hoverColor, restingColor);
  assert.notEqual(hoverColor, "rgba(0, 0, 0, 0)");
  await button("Expand Dock").click();
  await button("Use sidebar").click();
  await button("Close navigation").click();
  const sidebar = page.getByRole("navigation", { name: "Console navigation" });
  await sidebar.getByRole("button", { name: /^Command /u }).click();
  await commandInput.waitFor();
  await commandInput.press("Escape");
  assert.equal(
    await sidebar
      .getByRole("button", { name: /^Command /u })
      .evaluate((node) => node === document.activeElement),
    true
  );
  const sidebarOrder = sidebar.getByRole("link", {
    exact: true,
    name: "Orders",
  });
  const sidebarOrderBox = await sidebarOrder.boundingBox();
  const workforce = sidebar.getByRole("link", {
    exact: true,
    name: "Workforce",
  });
  assert.equal(await workforce.textContent(), "Workforce");
  assert.equal(
    await sidebar
      .getByText("Inspect workforce authentication information", {
        exact: true,
      })
      .count(),
    0
  );
  await page.keyboard.press("Tab");
  await workforce.focus();
  await page
    .getByRole("tooltip", {
      exact: true,
      name: "Inspect workforce authentication information",
    })
    .waitFor();
  assert.equal(await workforce.getAttribute("aria-label"), null);
  assert.ok(sidebarOrderBox.height >= 48);
  assert.equal(
    await sidebarOrder.evaluate(
      (node) =>
        Number(getComputedStyle(node).borderRadius.replace("px", "")) >= 24
    ),
    true
  );
  assert.equal(
    await button("Console navigation").evaluate(
      (node) => !!node.closest("main")
    ),
    false
  );
  const navigationBox = await button("Console navigation").boundingBox();
  const clearAfterSidebar = await button("Clear order filter").boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  assert.ok(
    navigationBox.x >= sidebarBox.x + sidebarBox.width + 24,
    JSON.stringify({ navigationBox, sidebarBox })
  );
  assert.ok(navigationBox.x < clearAfterSidebar.x);
  assert.ok(
    Math.abs(
      navigationBox.y +
        navigationBox.height / 2 -
        clearAfterSidebar.y -
        clearAfterSidebar.height / 2
    ) < 1
  );
  assert.ok(
    Math.abs(navigationBox.y - clearAfterSidebar.y) < 1 &&
      Math.abs(navigationBox.height - clearAfterSidebar.height) < 1
  );
  await page.setViewportSize({ height: 844, width: 390 });
  const mobileNavigationBox = await button("Console navigation").boundingBox();
  assert.ok(Math.abs(mobileNavigationBox.x - 20) < 1);
  assert.ok(
    mobileNavigationBox.x + mobileNavigationBox.width < 390,
    JSON.stringify({ mobileNavigationBox })
  );
  const mobileCorner = await page
    .locator('[data-console-corner="topLeft"]')
    .boundingBox();
  const mobileTabs = await page
    .getByRole("tablist", { name: "Orders" })
    .boundingBox();
  assert.ok(
    mobileCorner.x + mobileCorner.width <= mobileTabs.x ||
      mobileCorner.y + mobileCorner.height <= mobileTabs.y ||
      mobileTabs.y + mobileTabs.height <= mobileCorner.y,
    JSON.stringify({ mobileCorner, mobileTabs })
  );
  await page.setViewportSize({ height: 900, width: 1280 });
  const centeredTabs = await page
    .getByRole("tablist", { name: "Orders" })
    .boundingBox();
  const mainBounds = await page.locator("main").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const css = getComputedStyle(node);
    return {
      left: rect.left + Number(css.paddingLeft.replace("px", "")),
      right: rect.right - Number(css.paddingRight.replace("px", "")),
    };
  });
  assert.ok(
    Math.abs(
      centeredTabs.x +
        centeredTabs.width / 2 -
        (mainBounds.left + mainBounds.right) / 2
    ) < 1
  );
  await button("Console navigation").click();
  await button("Customize navigation").click();
  await button("Add destinations").click();
  await button("Add Workforce to preset").click();
  await button("Save").click();
  await button("Use Dock").click();
  await button("Close navigation").click();
  assert.equal(
    await button("Workforce").getAttribute("aria-label"),
    "Workforce"
  );
  await button("Workforce").hover();
  await page
    .getByRole("tooltip", {
      exact: true,
      name: "Inspect workforce authentication information",
    })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Filter order IDs" })
    .fill("sample-order-1");
  await page
    .getByRole("checkbox", { exact: true, name: "sample-order-1" })
    .check();
  // Navigation-only collapse coverage cannot catch a tray targeting the
  // default bar first, then snapping to a wider contextual-action toolbar.
  await page.waitForTimeout(300);
  const selectionTarget = await page
    .locator("[data-dashboard-dock-surface]")
    .boundingBox();
  await page.keyboard.press(commandKey);
  await commandInput.fill("Orders");
  await commandInput.press("Escape");
  await settleImmediateSurface();
  const commandSelection = await page
    .locator("[data-dashboard-dock-surface]")
    .boundingBox();
  assert.ok(Math.abs(commandSelection.width - selectionTarget.width) < 1);
  assert.equal(
    await page
      .getByRole("checkbox", { exact: true, name: "sample-order-1" })
      .isChecked(),
    true
  );
  await button("Console navigation").click();
  await checkExpansion();
  await page.evaluate(() => {
    window.selectionFrames = [];
    const start = performance.now();
    const sample = () => {
      const surface = document.querySelector("[data-dashboard-dock-surface]");
      window.selectionFrames.push(surface.getBoundingClientRect().toJSON());
      if (performance.now() - start < 400) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  await startChoreographySamples();
  await button("Close navigation").click();
  await page.waitForTimeout(450);
  const selectionFrames = await page.evaluate(() => window.selectionFrames);
  await checkChoreographySamples("selection close");
  assert.ok(selectionFrames.length > 5);
  for (const frame of selectionFrames) {
    assert.ok(
      frame.width >= selectionTarget.width - 1,
      "Collapse overshot contextual target"
    );
    assert.ok(
      Math.abs(
        frame.y + frame.height - selectionTarget.y - selectionTarget.height
      ) < 2,
      "Contextual collapse edge drift"
    );
  }
  assert.ok(Math.abs(selectionFrames.at(-1).width - selectionTarget.width) < 1);
  assert.equal(
    await page
      .getByRole("checkbox", { exact: true, name: "sample-order-1" })
      .isChecked(),
    true
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await button("Console navigation").click();
    await button("Close navigation").dispatchEvent("click", { detail: 1 });
    await page.waitForTimeout(70);
    await button("Console navigation").dispatchEvent("click", { detail: 1 });
    await checkExpansion();
    await button("Close navigation").click();
    await page.waitForTimeout(300);
    const restored = await page
      .locator("[data-dashboard-dock-surface]")
      .boundingBox();
    assert.ok(Math.abs(restored.width - selectionTarget.width) < 1);
    assert.equal(
      await page
        .getByRole("toolbar", { name: "Orders on this page selection actions" })
        .count(),
      1
    );
  }
  console.log(
    "Visual regressions: tab height/centers, clear icon ratio, actual Orders hover color, sidebar pill/main center, contextual collapse frames"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await button("Archive selected orders").click();
  await page.getByText("Sample: archived").waitFor();
  await button("Clear order filter").click();
  assert.equal(await page.getByRole("checkbox").count(), 3);
  for (const [label, path] of [
    ["Manage", "/orders/manage"],
    ["By status", "/orders/status"],
  ]) {
    await page.getByRole("tab", { exact: true, name: label }).click();
    await page.waitForURL(`${origin}${path}`);
  }
  // The return-cap seam is not proof of a tabs/object handoff. These frames
  // must show the same retained body skin travelling on real pointer routes.
  const sampleContext = () =>
    page.evaluate(async () => {
      const contextSamples = [];
      const start = performance.now();
      while (performance.now() - start < 450) {
        // oxlint-disable-next-line promise/avoid-new -- Synchronize with real browser paint frames.
        await new Promise(requestAnimationFrame);
        const skin = document.querySelector("[data-context-body-surface]");
        const content = document.querySelector("[data-context-content]");
        if (skin && content) {
          const box = skin.getBoundingClientRect();
          const control = content.querySelector("a, button");
          const hit = control?.getBoundingClientRect();
          contextSamples.push({
            hit:
              !!hit &&
              control.contains(
                document.elementFromPoint(
                  hit.x + hit.width / 2,
                  hit.y + hit.height / 2
                )
              ),
            inert: content.inert,
            opacity: Number(getComputedStyle(content).opacity),
            width: box.width,
          });
        }
      }
      return contextSamples;
    });
  const intoObject = sampleContext();
  await link("Details").first().click();
  assertContextTravel(await intoObject, "tabs→object");
  await heading("Order sample-order-1").waitFor();
  const objectContext = page.locator('[aria-label="Task context"]');
  const objectLabel = await objectContext.textContent();
  assert.ok(objectLabel.includes("sample-order-1"));
  assert.equal(await page.getByRole("tablist", { name: "Orders" }).count(), 0);
  const intoTabs = sampleContext();
  await button("Return to orders").click();
  assertContextTravel(await intoTabs, "object→tabs");
  await page.waitForURL(`${origin}/orders/manage`);
  await heading("Orders").waitFor();
  const tabsBox = await page
    .getByRole("tablist", { name: "Orders" })
    .boundingBox();
  assert.ok(tabsBox.y < 56);
  await link("Details").first().press("Enter");
  await heading("Order sample-order-1").waitFor();
  assert.equal(
    await page
      .locator("[data-context-body-surface]")
      .getAttribute("data-travelling"),
    "false"
  );
  assert.equal(await objectContext.locator("[data-gooey-svg]").count(), 0);
  await button("Return to orders").press("Enter");
  await heading("Orders").waitFor();
  assert.equal(
    await page
      .locator("[data-context-body-surface]")
      .getAttribute("data-travelling"),
    "false"
  );
  for (let turn = 0; turn < 2; turn += 1) {
    await link("Details").first().click();
    await button("Return to orders").click();
    await heading("Orders").waitFor();
  }
  await page.waitForTimeout(250);
  assert.equal(
    await page
      .locator("[data-context-body-surface]")
      .getAttribute("data-context-surface"),
    "tabs"
  );
  assert.equal(await button("Return to orders").count(), 0);
  await page.getByRole("tab", { exact: true, name: "By status" }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.waitForURL(`${origin}/orders/manage`);
  console.log(
    "Orders: filter, selection, confirmation/archive, clear, tabs, detail object context and explicit return"
  );

  await navigate("Dashboard", "/", "Dashboard");
  assert.equal(
    await page
      .getByRole("region", { exact: true, name: "Auth information" })
      .count(),
    2
  );
  const light = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  await button("Dark theme").hover();
  await page
    .getByRole("tooltip", { exact: true, name: "Use dark theme" })
    .waitFor();
  await page.mouse.move(0, 0);
  await page
    .getByRole("tooltip", { exact: true, name: "Use dark theme" })
    .waitFor({ state: "hidden" });
  await button("Sample preview").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await button("Dark theme").evaluate(
      (element) => document.activeElement === element
    ),
    true
  );
  await page
    .getByRole("tooltip", { exact: true, name: "Use dark theme" })
    .waitFor();
  await button("Dark theme").click();
  const dark = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.notEqual(light, dark);
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  const darkOrders = button("Orders");
  await page.mouse.move(0, 450);
  const darkResting = await darkOrders.evaluate(
    (node) => getComputedStyle(node).backgroundColor
  );
  await darkOrders.hover();
  await page.waitForTimeout(200);
  const darkHover = await darkOrders.evaluate(
    (node) => getComputedStyle(node).backgroundColor
  );
  assert.notEqual(darkHover, darkResting);
  assert.notEqual(darkHover, "rgba(0, 0, 0, 0)");
  await page.keyboard.press("Tab");
  await button("Expand Dock").focus();
  await page.waitForFunction(() => {
    const node = document.activeElement;
    const style = getComputedStyle(node);
    return (
      node.matches(":focus-visible") &&
      (style.outlineStyle !== "none" || style.boxShadow !== "none")
    );
  });
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await button("Close navigation").focus();
  // Focus tooltips are the innermost overlay and may consume the first Escape.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Expand Dock"
  );
  console.log(
    "Themes and keyboard: light/dark backgrounds, visible focus ring, Enter directory, Escape dismissal"
  );

  await page.setViewportSize({ height: 844, width: 390 });
  for (const position of ["top", "left", "right", "bottom"]) {
    await startChoreographySamples();
    await button("Expand Dock").click();
    await checkChoreographySamples(`narrow open/${position}`);
    await startChoreographySamples();
    await button("Navigation settings").click();
    await checkChoreographySamples(`narrow settings/${position}`);
    await selectOption("Dock position", position);
    await button("Save").click();
    await page.getByRole("textbox", { name: "Search navigation" }).focus();
    await checkExpansion(position);
    await startChoreographySamples();
    await checkCollapse(position);
    await checkChoreographySamples(`narrow collapse/${position}`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await button("Expand Dock").focus();
  await page.keyboard.press("Enter");
  await checkExpansion();
  assert.equal(
    await page
      .locator("[data-dashboard-dock-surface]")
      .evaluate((node) => getComputedStyle(node).transform),
    "none"
  );
  for (const position of ["top", "left", "right", "bottom"]) {
    await button("Navigation settings").click();
    await selectOption("Dock position", position);
    await button("Save").click();
    await page.getByRole("textbox", { name: "Search navigation" }).focus();
    await checkExpansion(position);
  }
  await button("Customize navigation").click();
  await button("Save").scrollIntoViewIfNeeded();
  assert.equal(
    await button("Save").evaluate((node) => {
      const r = node.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        node.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        )
      );
    }),
    true
  );
  await page.keyboard.press("Escape");
  await button("Customize navigation").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  for (const [label, path, title] of [
    ["Plugins", "/plugins", "Plugin manager"],
    ["Workforce sessions", "/workforce/sessions", "Sessions"],
    ["Customer subjects", "/customers/subjects", "Subjects"],
    ["Orders", "/orders", "Orders"],
    ["Dashboard", "/", "Dashboard"],
  ]) {
    await navigate(label, path, title);
    if (label === "Orders") {
      const geometry = await page
        .getByRole("navigation", { name: "Orders pages" })
        .boundingBox();
      assert.ok(
        geometry.y < 56 &&
          geometry.x >= 48 &&
          geometry.x + geometry.width <= 342
      );
      for (const tab of await page.getByRole("tab").all()) {
        const tabGeometry = await tab.boundingBox();
        assert.ok(Math.abs(tabGeometry.y - geometry.y) < 8);
      }
      await page
        .getByRole("checkbox", { exact: true, name: "sample-order-2" })
        .check();
      await settleImmediateSurface();
      const mobileSelection = await page
        .locator("[data-dashboard-dock-surface]")
        .boundingBox();
      await button("Console navigation").click();
      await checkExpansion();
      await button("Close navigation").click();
      await settleImmediateSurface();
      const restoredSelection = await page
        .locator("[data-dashboard-dock-surface]")
        .boundingBox();
      assert.ok(
        Math.abs(mobileSelection.height - restoredSelection.height) < 1,
        JSON.stringify({ mobileSelection, restoredSelection })
      );
      assert.ok(Math.abs(mobileSelection.width - restoredSelection.width) < 1);
      assert.equal(
        await page
          .locator("[data-dashboard-dock-surface]")
          .evaluate((node) => getComputedStyle(node).transform),
        "none"
      );
      await button("Exit selection").click();
      await page.getByRole("tab", { exact: true, name: "Manage" }).click();
      await page.waitForURL(`${origin}/orders/manage`);
      // Desktop fallback tabs cannot prove the new object/return split fits a
      // narrow main region, or Command's focus and results in both themes.
      await link("Details").first().click();
      await heading("Order sample-order-1").waitFor();
      for (const theme of ["light", "dark"]) {
        const themeToggle = button("Dark theme");
        if (
          (await themeToggle.getAttribute("aria-pressed")) !==
          String(theme === "dark")
        ) {
          await themeToggle.click();
        }
        const contextBox = await page
          .locator('[aria-label="Task context"]')
          .boundingBox();
        assert.ok(contextBox.x >= 48);
        assert.ok(contextBox.x + contextBox.width <= 342);
        const returnButton = button("Return to orders");
        assert.equal(
          await returnButton.evaluate((node) => {
            const r = node.getBoundingClientRect();
            return node.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            );
          }),
          true
        );
        await page.keyboard.press(commandKey);
        await commandInput.waitFor();
        assert.equal(
          await commandInput.evaluate(
            (node) => node === document.activeElement
          ),
          true
        );
        const commandBox = await page
          .getByRole("dialog", { name: "Command" })
          .boundingBox();
        assert.ok(commandBox.x >= 0 && commandBox.y >= 0);
        assert.ok(commandBox.x + commandBox.width <= 390);
        assert.ok(commandBox.y + commandBox.height <= 844);
        await commandInput.fill("no-sample-command");
        await page
          .getByText("No matching commands.", { exact: true })
          .waitFor();
        await commandInput.press("Escape");
      }
      await button("Return to orders").press("Enter");
      await page.waitForURL(`${origin}/orders/manage`);
      console.log(
        "Mobile Command/context: light/dark focus, empty results, viewport bounds, unobstructed explicit return and reduced-motion restoration"
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    assert.equal(
      await button("Expand Dock").evaluate((node) => {
        const r = node.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          node.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          )
        );
      }),
      true
    );
  }
  console.log(
    "Narrow geometry: no horizontal overflow; navigation in viewport and unobstructed"
  );
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await button("Expand Dock").click();
  await button("Customize navigation").click();
  assert.equal(await button("Drag Orders").count(), 1);
  assert.equal(await page.getByLabel("Search navigation").count(), 0);
  await button("Preset actions").click();
  await page.getByRole("menuitem", { exact: true, name: "New preset" }).click();
  await page.getByLabel("Preset name", { exact: true }).fill("Auth work");
  await button("Add destinations").click();
  await button("Add Workforce to preset").click();
  await button("Add destinations").click();
  await button("Add Customers to preset").click();
  await button("Drag Workforce").hover();
  const handlesBeforeDrag = await page
    .locator("[data-console-edit-item]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.consoleEditItem));
  const [dragFrom, dragTo] = await Promise.all([
    button("Drag Workforce").boundingBox(),
    button("Drag Customers").boundingBox(),
  ]);
  const sibling = page.locator("[data-console-edit-item]").nth(1);
  const siblingBefore = await sibling.boundingBox();
  await page.mouse.move(
    dragFrom.x + dragFrom.width / 2,
    dragFrom.y + dragFrom.height / 2
  );
  await page.mouse.down();
  const samples = sibling.evaluate(async (node) => {
    const positions = [];
    const start = performance.now();
    // oxlint-disable-next-line promise/avoid-new -- Resolve after sampling the actual painted drag, not a final-order timeout.
    await new Promise((resolve) => {
      const capture = () => {
        const r = node.getBoundingClientRect();
        positions.push({
          overlay: !!document.querySelector("[data-console-drag-overlay]"),
          x: r.x,
          y: r.y,
        });
        if (performance.now() - start < 350) {
          requestAnimationFrame(capture);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(capture);
    });
    return positions;
  });
  await page.mouse.move(
    dragTo.x + dragTo.width / 2,
    dragTo.y + dragTo.height / 2
  );
  const dragFrames = await samples;
  const siblingAfter = await page
    .locator("[data-console-edit-item]")
    .first()
    .boundingBox();
  await page.screenshot({
    path: `${process.env.DELTA_SCRATCH_DIR ?? "/tmp"}/lenso-drag-held.png`,
  });
  assert.ok(
    dragFrames.some(
      (frame) =>
        frame.x > Math.min(siblingBefore.x, siblingAfter.x) + 1 &&
        frame.x < Math.max(siblingBefore.x, siblingAfter.x) - 1
    ),
    "Siblings must travel through intermediate positions during live insertion, not teleport on drop"
  );
  assert.ok(
    dragFrames.every((frame) => frame.overlay),
    "Lift remains visible throughout held drag"
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(
    await page
      .locator("[data-console-edit-item]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.dataset.consoleEditItem)
      ),
    handlesBeforeDrag
  );
  assert.equal(await page.locator("[data-console-drag-overlay]").count(), 0);
  console.log(
    `Preset drag: ${dragFrames.length} intermediate frames with live sibling travel, crisp lift and Escape rollback`
  );
  await button("Drag Workforce").focus();
  await page.keyboard.press(commandKey);
  await commandInput.press("Escape");
  assert.equal(await button("Remove Customers from preset").isVisible(), true);
  assert.equal(
    await button("Drag Workforce").evaluate(
      (node) => node === document.activeElement
    ),
    true
  );
  // A popup bounding box and center hit miss clipping at the Dock boundary.
  // This editor menu actually projects above the original physical shell.
  await button("Dock preset: Auth work").press("ArrowDown");
  const presetMenu = page.getByRole("menu", { name: "Dock presets" });
  await presetMenu.waitFor();
  assert.equal(
    await presetMenu.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const dock = document
        .querySelector("[data-dashboard-dock-surface]")
        .getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + 8;
      return y < dock.top && node.contains(document.elementFromPoint(x, y));
    }),
    true
  );
  await page.keyboard.press("Escape");
  await presetMenu.waitFor({ state: "hidden" });
  assert.equal(
    await button("Dock preset: Auth work").evaluate(
      (node) => node === document.activeElement
    ),
    true
  );
  assert.equal(await button("Save").isVisible(), true);
  console.log(
    "Preset portal: viewport hit outside physical Dock; Escape restores editor trigger"
  );
  await button("Save").click();
  await button("Dock preset: Auth work").waitFor();
  await button("Close navigation").click();
  const beforeReload = page.url();
  await page.reload();
  await heading("Dashboard").waitFor();
  assert.equal(page.url(), beforeReload);
  await button("Workforce").waitFor();
  await button("Customers").waitFor();
  await button("Expand Dock").click();
  await button("Dock preset: Auth work").click();
  await page
    .getByRole("menuitemradio", { exact: true, name: "Default" })
    .click();
  await button("Dock preset: Default").click();
  await page
    .getByRole("menuitemradio", { exact: true, name: "Auth work" })
    .click();
  await page.keyboard.press(commandKey);
  await commandInput.fill("Default");
  await page
    .getByRole("region", { name: "Dock presets" })
    .getByRole("button", { exact: true, name: "Default" })
    .click();
  await button("Dock preset: Default").waitFor();
  await page.keyboard.press(commandKey);
  await commandInput.fill("Auth work");
  await page
    .getByRole("region", { name: "Dock presets" })
    .getByRole("button", { exact: true, name: "Auth work" })
    .click();
  await button("Dock preset: Auth work").waitFor();
  await button("Customize navigation").click();
  await button("Remove Customers from preset").click();
  assert.equal(await button("Drag Customers").count(), 0);
  await button("Add destinations").click();
  assert.equal(await button("Add Customers to preset").isEnabled(), true);
  assert.equal(await button("Workforce, already in preset").isDisabled(), true);
  await button("Close destination picker").click();
  await button("Cancel").click();
  await button("Close navigation").click();
  await button("Customers").waitFor();
  console.log(
    "Presets: create/add/save/reload/switch/cancel preserve user contents and route"
  );

  const touchContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });
  const touchPage = await touchContext.newPage();
  touchPage.on("pageerror", (error) => errors.push(error.message));
  await touchPage.goto(origin);
  await touchPage.waitForFunction(() => {
    const content = document.querySelector("[data-dashboard-dock-content]");
    const pane = document.querySelector(
      '.dashboard-dock-pane[data-present="true"]'
    );
    return (
      content &&
      getComputedStyle(content).pointerEvents === "auto" &&
      pane?.dataset.ready === "true"
    );
  });
  await touchPage
    .getByRole("button", { exact: true, name: "Expand Dock" })
    .tap();
  // boundingBox returns the measurable target even while it is clipped/inert.
  // Coordinate-based CDP gestures must start on the presented surface.
  await touchPage.waitForFunction(() => {
    const content = document.querySelector("[data-dashboard-dock-content]");
    return (
      document.querySelector('[role="dialog"]') &&
      content &&
      getComputedStyle(content).pointerEvents === "auto"
    );
  });
  const touchSession = await touchContext.newCDPSession(touchPage);
  const touch = (type, point) =>
    touchSession.send("Input.dispatchTouchEvent", {
      touchPoints: point ? [{ x: point.x, y: point.y }] : [],
      type,
    });
  const workforceTile = await touchPage
    .getByRole("dialog")
    .getByRole("link", { exact: true, name: "Workforce" })
    .boundingBox();
  const tilePoint = {
    x: workforceTile.x + workforceTile.width / 2,
    y: workforceTile.y + workforceTile.height / 2,
  };
  await touch("touchStart", tilePoint);
  await touch("touchMove", { x: tilePoint.x, y: tilePoint.y - 40 });
  await touchPage.waitForTimeout(600);
  await touch("touchEnd");
  assert.equal(
    await touchPage.getByRole("button", { exact: true, name: "Save" }).count(),
    0
  );
  assert.equal(new URL(touchPage.url()).pathname, "/");
  const tile = await touchPage
    .getByRole("dialog")
    .getByRole("link", { exact: true, name: "Workforce" })
    .boundingBox();
  await touch("touchStart", {
    x: tile.x + tile.width / 2,
    y: tile.y + tile.height / 2,
  });
  await touchPage.getByRole("button", { exact: true, name: "Save" }).waitFor();
  await touch("touchEnd");
  assert.equal(new URL(touchPage.url()).pathname, "/");
  await touchPage
    .getByRole("button", { exact: true, name: "Add destinations" })
    .tap();
  await touchPage
    .getByRole("button", { exact: true, name: "Add Workforce to preset" })
    .tap();
  const handles = touchPage.getByRole("button", { name: /^Drag /u });
  const [firstHandle, secondHandle] = await Promise.all([
    handles.nth(0).boundingBox(),
    handles.nth(1).boundingBox(),
  ]);
  const firstName = await handles.nth(0).getAttribute("aria-label");
  const secondName = await handles.nth(1).getAttribute("aria-label");
  await touch("touchStart", {
    x: firstHandle.x + firstHandle.width / 2,
    y: firstHandle.y + firstHandle.height / 2,
  });
  await touch("touchMove", {
    x: secondHandle.x + secondHandle.width / 2,
    y: secondHandle.y + secondHandle.height / 2,
  });
  await touch("touchEnd");
  assert.equal(await handles.nth(0).getAttribute("aria-label"), secondName);
  assert.equal(await handles.nth(1).getAttribute("aria-label"), firstName);
  // Escape alone does not prove that native touch cancellation restores insertion.
  const [cancelFrom, cancelTo] = await Promise.all([
    handles.nth(0).boundingBox(),
    handles.nth(1).boundingBox(),
  ]);
  await touch("touchStart", {
    x: cancelFrom.x + cancelFrom.width / 2,
    y: cancelFrom.y + cancelFrom.height / 2,
  });
  await touch("touchMove", {
    x: cancelTo.x + cancelTo.width / 2,
    y: cancelTo.y + cancelTo.height / 2,
  });
  await touch("touchCancel");
  assert.equal(await handles.nth(0).getAttribute("aria-label"), secondName);
  assert.equal(await handles.nth(1).getAttribute("aria-label"), firstName);
  assert.equal(
    await touchPage.locator("[data-console-drag-overlay]").count(),
    0
  );
  await touchPage.getByRole("button", { exact: true, name: "Save" }).tap();
  await touchPage
    .getByRole("button", { exact: true, name: "Close navigation" })
    .tap();
  await touchContext.close();
  console.log(
    "Touch Chromium: movement cancels long press/navigation; deliberate hold enters edit; captured handle drag reorders and saves"
  );
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  console.log("PASS: no browser errors, failed requests or external requests");
} finally {
  await browser.close();
}
