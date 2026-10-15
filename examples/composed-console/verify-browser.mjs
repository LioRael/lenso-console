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
const fillOrderSearch = async (value) => {
  const input = page.getByRole("searchbox", {
    exact: true,
    name: "Filter order IDs",
  });
  if (!(await input.isVisible())) {
    await button("Filter order IDs").click();
  }
  await input.fill(value);
};
const draftTableFilter = async (label, field, value) => {
  await page
    .getByRole("button", { name: new RegExp(`^${label}:`, "u") })
    .click();
  await page
    .getByRole("combobox", { exact: true, name: "Add condition to group 1" })
    .click();
  await page.getByRole("option", { exact: true, name: field }).click();
  await page
    .getByRole("textbox", { exact: true, name: `Value for ${field}` })
    .fill(value);
  await page.keyboard.press("Enter");
};
const finishTableFilter = async (action = "Apply filters") => {
  await button(action).click();
  await page
    .getByRole("dialog", { exact: true, name: "Filters" })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.activeElement?.getAttribute("aria-label")?.startsWith("Filter ")
  );
};
const clearTableFilter = async (label) => {
  await page
    .getByRole("button", { name: new RegExp(`^${label}:`, "u") })
    .click();
  await button("Clear filters").click();
  await finishTableFilter();
};
const setTheme = (theme) =>
  page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
  }, theme);
// Tabs/object coverage misses detail→list: both contributions are objects,
// but the retained skin must still resize rather than replace its geometry.
const verifySessionReturn = async () => {
  await page.goto(`${origin}/workforce/sessions`);
  await link("sample-workforce-1").waitFor();
  await page.waitForTimeout(300);
  const sampleIsland = () =>
    page.evaluate(async () => {
      const skin = document.querySelector("[data-context-body-surface]");
      const samples = [];
      const start = performance.now();
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- Serialized browser helper.
      const readCap = () => {
        const cap = document.querySelector('[data-context-surface="return"]');
        const capBox = cap?.getBoundingClientRect();
        const control = cap?.parentElement.querySelector("button");
        const wrapper = cap?.parentElement.getBoundingClientRect();
        const escapedCapHits = [];
        if (control && capBox) {
          const box = control.getBoundingClientRect();
          for (const [x, y] of [
            [box.x + box.width / 2, box.y + box.height / 2],
            [capBox.x + 0.5, capBox.y + 0.5],
            [capBox.right + 1, capBox.y + capBox.height / 2],
          ]) {
            if (
              (x > capBox.right || x < capBox.x || y < capBox.y + 1) &&
              control.contains(document.elementFromPoint(x, y))
            ) {
              escapedCapHits.push([x, y]);
            }
          }
        }
        return {
          capInert: !cap || cap.parentElement.inert,
          capOpacity: control ? Number(getComputedStyle(control).opacity) : 0,
          capRetiring:
            cap?.parentElement.getAttribute("aria-hidden") === "true",
          capWidth: capBox?.width ?? 0,
          capWrapperWidth: wrapper?.width ?? 0,
          escapedCapHits,
        };
      };
      while (performance.now() - start < 500) {
        // oxlint-disable-next-line promise/avoid-new -- Observe actual browser frames.
        await new Promise(requestAnimationFrame);
        const current = document.querySelector("[data-context-body-surface]");
        const box = current.getBoundingClientRect();
        const style = getComputedStyle(current);
        const matrix = new DOMMatrixReadOnly(style.transform);
        const radii = style.clipPath
          .match(/round ([^)]*)/u)?.[1]
          .split(" ")
          .map(Number.parseFloat);
        const radius = radii
          ? (radii[1] ?? radii[0]) * Math.abs(matrix.a)
          : Number(style.borderTopRightRadius.replace("px", ""));
        const content = document.querySelector("[data-context-content]");
        const contentBox = content.getBoundingClientRect();
        const contentClip = getComputedStyle(content).clipPath.match(
          /inset\(([^)]*?) round/u
        );
        const insets = contentClip?.[1].split(" ").map(Number.parseFloat);
        const clip = insets && [
          contentBox.y + insets[0],
          contentBox.right - (insets[1] ?? insets[0]),
          contentBox.bottom - (insets[2] ?? insets[0]),
          contentBox.x + (insets[3] ?? insets[1] ?? insets[0]),
        ];
        samples.push({
          ...readCap(),
          clip,
          edges: [box.y, box.right, box.bottom, box.x],
          height: box.height,
          inert: content.inert,
          opacity: Number(getComputedStyle(content).opacity),
          radius,
          retained: current === skin,
          width: box.width,
          x: box.x,
        });
      }
      return samples;
    });
  const forwardSampling = sampleIsland();
  await link("sample-workforce-1").click();
  await button("Return to sessions").waitFor();
  const forward = await forwardSampling;
  assert.ok(
    forward.every((frame) => frame.retained),
    "Forward retains body skin"
  );
  assert.ok(
    forward.every((frame) => frame.radius >= frame.height / 2 - 1),
    `Session list→detail keeps circular body corners EVERY frame: ${JSON.stringify(forward.filter((frame) => frame.radius < frame.height / 2 - 1))}`
  );
  await page.waitForTimeout(300);
  const sampling = sampleIsland();
  await button("Return to sessions").click();
  await page.waitForURL(`${origin}/workforce/sessions`);
  const frames = await sampling;
  for (const frame of [...forward, ...frames]) {
    assert.ok(
      frame.radius >= frame.height / 2 - 1,
      "Body corners remain circular"
    );
    assert.ok(frame.clip, "Content has a physical rounded clip");
    for (const [index, edge] of frame.edges.entries()) {
      assert.ok(
        Math.abs(edge - frame.clip[index]) < 1,
        "Content clip matches the visible body"
      );
    }
    assert.ok(
      Math.abs(frame.capWrapperWidth - frame.capWidth) < 1,
      "Visible and hit-test cap widths agree"
    );
    assert.deepEqual(
      frame.escapedCapHits,
      [],
      "No cap hits outside its visible shape"
    );
    if (frame.capRetiring) {
      assert.ok(
        frame.capInert,
        "Outgoing return control is inert from the first frame"
      );
    }
  }
  assert.ok(
    frames.every((frame) => frame.retained),
    "Session return retains the island"
  );
  assert.ok(
    new Set(frames.map((frame) => Math.round(frame.width))).size > 3,
    "Session detail→list interpolates the body width"
  );
  assert.ok(
    frames.some((frame) => frame.opacity < 0.9 && frame.inert),
    "Incoming session context waits for its skin"
  );
  const shrinking = frames.filter(
    (frame) => frame.capWidth > 0 && frame.capWidth < 35
  );
  assert.ok(
    new Set(shrinking.map((frame) => Math.round(frame.capWidth))).size > 3,
    `Return region must shrink, not vanish at full width: ${JSON.stringify(frames)}`
  );
  const removed = frames.findIndex(
    (frame, index) => index > 0 && !frame.capWidth && frames[index - 1].capWidth
  );
  assert.ok(removed > 0, "Return cap retires");
  assert.ok(
    frames[removed - 1].capWidth < 2,
    "Cap reaches zero before retirement"
  );
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(
      frames[index].capWidth <= frames[index - 1].capWidth + 0.5,
      "Retiring cap never revives"
    );
    assert.ok(
      frames[index].capOpacity <= frames[index - 1].capOpacity + 0.01,
      "Retiring return arrow never reappears"
    );
    if (frames[index].capWidth < 35) {
      assert.ok(frames[index].capInert, "Outgoing cap is inert immediately");
    }
  }
  assert.ok(
    Math.abs(
      frames[removed].x +
        frames[removed].width / 2 -
        (frames[removed - 1].x + frames[removed - 1].width / 2)
    ) < 2,
    `Removing the return cap does not snap the body: ${JSON.stringify(frames.slice(removed - 1, removed + 1))}`
  );
  assert.equal(frames.at(-1).opacity, 1);
  assert.equal(frames.at(-1).inert, false);
  assert.equal(await button("Return to sessions").count(), 0);
  console.log(
    `Session forward/return: ${forward.length}/${frames.length} retained radius/clip/cap-width/visibility frames`
  );
  for (const reducedMotion of ["no-preference", "reduce"]) {
    await page.emulateMedia({ reducedMotion });
    await page.goto(`${origin}/workforce/sessions/sample-workforce-1`);
    await button("Return to sessions").waitFor();
    await button("Return to sessions").focus();
    const focus = await button("Return to sessions").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        offset: Number(style.outlineOffset.replace("px", "")),
        outline: style.outlineStyle,
      };
    });
    assert.equal(
      focus.outline,
      "solid",
      "Return control has a visible focus ring"
    );
    assert.ok(
      focus.offset < 0,
      "Return focus ring stays inside the physical cap clip"
    );
    await (reducedMotion === "reduce"
      ? button("Return to sessions").click()
      : button("Return to sessions").press("Enter"));
    await page.waitForURL(`${origin}/workforce/sessions`);
    assert.equal(
      await page
        .locator("[data-context-body-surface]")
        .getAttribute("data-travelling"),
      "false",
      `Session return is immediate for ${reducedMotion}`
    );
    assert.equal(
      await page
        .locator("[data-context-content]")
        .evaluate((node) => node.inert),
      false
    );
    assert.equal(await button("Return to sessions").count(), 0);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
};
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
      if (performance.now() - start < 650) {
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
  await page.waitForTimeout(700);
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
  if (title) {
    await (
      title === "Sessions" || title === "Subjects" || title === "Plugin manager"
        ? page.getByRole("region", { exact: true, name: title })
        : heading(title).first()
    ).waitFor();
  }
  assert.equal(await page.getByRole("alert").count(), 0);
  console.log(`Navigation: ${label} -> ${path}`);
};

// Existing tooltip checks cover compact Dock anchors and sidebar focus, not
// launcher edge tiles whose overlays can inherit the rounded Dock hit clip.
const verifyLauncherTooltip = async () => {
  for (const { width, height } of [
    { height: 776, width: 1512 },
    { height: 844, width: 390 },
  ]) {
    await page.setViewportSize({ height, width });
    await page.goto(origin);
    await button("Expand Dock").click();
    const workforce = page.getByRole("dialog").getByRole("link", {
      exact: true,
      name: "Workforce",
    });
    for (const theme of ["light", "dark"]) {
      await setTheme(theme);
      // Tile portals do not prove the shared icon-button portal escapes the clip.
      for (const { control, name } of [
        {
          control: workforce,
          name: "Inspect workforce authentication information",
        },
        {
          control: button("Command"),
          name: "Command (⌘K / Ctrl+K)",
        },
      ]) {
        for (const trigger of ["pointer", "focus"]) {
          await page.mouse.move(0, 0);
          await control.evaluate((node) => node.blur());
          if (trigger === "pointer") {
            await control.hover();
          } else {
            await page.keyboard.press("Tab");
            await control.focus();
          }
          const tooltip = page.getByRole("tooltip", {
            exact: true,
            name,
          });
          await tooltip.waitFor();
          await page.waitForTimeout(250);
          const geometry = await tooltip.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const clipped = [];
            for (
              let ancestor = node.parentElement;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor);
              if (
                style.clipPath !== "none" ||
                /hidden|clip|auto|scroll/u.test(style.overflow)
              ) {
                const bounds = ancestor.getBoundingClientRect();
                if (
                  box.left < bounds.left ||
                  box.right > bounds.right ||
                  box.top < bounds.top ||
                  box.bottom > bounds.bottom
                ) {
                  clipped.push({
                    clip: style.clipPath,
                    overflow: style.overflow,
                  });
                }
              }
            }
            const style = getComputedStyle(node);
            return {
              clipped,
              edges: [box.left, box.top, box.right, box.bottom],
              exposed: [
                box.left + 8,
                box.left + box.width / 2,
                box.right - 8,
              ].every((x) =>
                node.contains(
                  document.elementFromPoint(x, box.top + box.height / 2)
                )
              ),
              tokens: ["--background", "--foreground", "--overlay"].map(
                (token) => style.getPropertyValue(token)
              ),
            };
          });
          assert.deepEqual(
            geometry.clipped,
            [],
            `${width}/${theme}/${trigger}: launcher tooltip must escape physical Dock clipping`
          );
          assert.ok(
            geometry.exposed,
            `${width}/${theme}/${trigger}: tooltip is not occluded at either edge or centre`
          );
          assert.ok(
            geometry.edges[0] >= 0 &&
              geometry.edges[1] >= 0 &&
              geometry.edges[2] <= width &&
              geometry.edges[3] <= height,
            `${width}/${theme}/${trigger}: tooltip stays in viewport`
          );
          const tokens = await control.evaluate((node) => {
            const style = getComputedStyle(node);
            return ["--background", "--foreground", "--overlay"].map((token) =>
              style.getPropertyValue(token)
            );
          });
          assert.ok(
            tokens.every((token) => token.trim()),
            "Theme tokens are defined"
          );
          assert.deepEqual(
            geometry.tokens,
            tokens,
            "Portaled tooltip retains launcher theme tokens"
          );
          if (trigger === "focus") {
            assert.equal(
              await control.evaluate((node) => node === document.activeElement),
              true
            );
            assert.equal(
              await control.evaluate((node) => {
                const style = getComputedStyle(node);
                return (
                  node.matches(":focus-visible") &&
                  ((style.outlineStyle !== "none" &&
                    // oxlint-disable-next-line unicorn/prefer-number-coercion -- Computed outline widths contain a CSS unit, such as 2px.
                    Number.parseFloat(style.outlineWidth) > 0) ||
                    style.boxShadow !== "none")
                );
              }),
              true
            );
          }
          await control.press("Escape");
          await tooltip.waitFor({ state: "hidden" });
          console.log(
            `Launcher tooltip: ${width}/${theme}/${trigger}/${name}, unclipped, viewport-contained, themed`
          );
        }
      }
    }
    const layout = await page
      .getByRole("region", { exact: true, name: "Destinations" })
      .evaluate((node) => {
        const box = node.getBoundingClientRect();
        const utilities = document
          .querySelector('[aria-label="Quick controls"]')
          .getBoundingClientRect();
        return {
          destinationHeight: box.height,
          fullyVisible: [...node.querySelectorAll("a")].every((anchor) => {
            const bounds = anchor.getBoundingClientRect();
            return (
              bounds.left >= box.left - 1 &&
              bounds.right <= box.right + 1 &&
              bounds.top >= box.top - 1 &&
              bounds.bottom <= box.bottom + 1
            );
          }),
          utilityHeight: utilities.height,
        };
      });
    assert.ok(layout.utilityHeight <= 48, "Utilities fit one compact row");
    assert.ok(
      layout.destinationHeight > layout.utilityHeight,
      "Destinations remain the primary launcher content"
    );
    assert.ok(layout.fullyVisible, "All sample destinations fit visibly");
    console.log(`Launcher space ${width}: ${JSON.stringify(layout)}`);
  }
};

try {
  if (process.env.COMPOSED_BROWSER_CHECK === "launcher-tooltip") {
    await verifyLauncherTooltip();
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log("PASS: targeted launcher tooltip");
    await browser.close();
    process.exit(0);
  }
  await verifySessionReturn();
  if (process.env.COMPOSED_BROWSER_CHECK === "context-return") {
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log("PASS: targeted session return");
    await browser.close();
    process.exit(0);
  }
  await verifyLauncherTooltip();
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto(origin);
  await heading("Sample workforce").waitFor();
  const commandKey = (await page.evaluate(() =>
    /Mac|iPhone|iPad/u.test(navigator.platform)
  ))
    ? "Meta+k"
    : "Control+k";
  const commandInput = page.getByRole("searchbox", { name: "Search commands" });
  assert.equal(await button("Console navigation").count(), 0);
  assert.equal(await heading("Dashboard").count(), 0);
  assert.equal(await button("Done editing dashboard").count(), 0);
  await button("Expand Dock").waitFor();
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
                : [
                    {
                      control: node.textContent,
                      hit: hit?.outerHTML,
                      hitBox: hit?.getBoundingClientRect().toJSON(),
                      hitStyle: hit && {
                        bottom: getComputedStyle(hit).bottom,
                        display: getComputedStyle(hit).display,
                        left: getComputedStyle(hit).left,
                        right: getComputedStyle(hit).right,
                        top: getComputedStyle(hit).top,
                      },
                      x: r.x + x,
                      y: r.y + y,
                    },
                  ];
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
        await page
          .getByRole("tooltip", { exact: true, name: "Expand Dock" })
          .waitFor({ state: "hidden" });
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
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForTimeout(450);
  const collapsedEndpoint = await page
    .locator("[data-dashboard-dock-surface]")
    .boundingBox();
  await page.evaluate(() => {
    const frames = [];
    window.dockFrames = frames;
    const start = performance.now();
    const channel = new MessageChannel();
    const sample = () => {
      const r = document
        .querySelector("[data-dashboard-dock-surface]")
        .getBoundingClientRect();
      frames.push({
        bottom: r.bottom,
        height: r.height,
        width: r.width,
      });
      if (performance.now() - start < 500) {
        requestAnimationFrame(() => channel.port2.postMessage(null));
      } else {
        channel.port1.close();
        channel.port2.close();
      }
    };
    channel.port1.addEventListener("message", sample);
    channel.port1.start();
    document
      .querySelector(".dashboard-dock")
      .addEventListener(
        "pointerdown",
        () => requestAnimationFrame(() => channel.port2.postMessage(null)),
        { once: true }
      );
  });
  await button("Expand Dock").click();
  await page.waitForTimeout(550);
  const frames = await page.evaluate(() => window.dockFrames);
  const expandedEndpoint = await page
    .locator("[data-dashboard-dock-surface]")
    .boundingBox();
  console.log(
    `Dock expansion endpoints/samples: ${JSON.stringify({
      collapsedEndpoint,
      expandedEndpoint,
      heights: [...new Set(frames.map((frame) => frame.height))],
      samples: frames.length,
      widths: [...new Set(frames.map((frame) => frame.width))],
    })}`
  );
  for (const dimension of ["width", "height"]) {
    assert.ok(
      expandedEndpoint[dimension] > collapsedEndpoint[dimension] + 4,
      `Expansion must increase ${dimension}`
    );
    assert.ok(
      frames.some(
        (frame) =>
          frame[dimension] > collapsedEndpoint[dimension] + 2 &&
          frame[dimension] < expandedEndpoint[dimension] - 2
      ),
      `Dock ${dimension} must morph between actual endpoints, not teleport`
    );
  }
  assert.ok(
    frames.every(
      (frame) =>
        Math.abs(
          frame.bottom - collapsedEndpoint.y - collapsedEndpoint.height
        ) < 2
    ),
    "Expansion retains the settled bottom docking edge"
  );
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
  const dashboardGeometry = await heading("Sample workforce")
    .first()
    .boundingBox();
  await button("Start feedback mode").focus();
  await page.keyboard.press("Enter");
  await heading("Sample workforce").first().click();
  const feedback =
    "Keep the sample-data notice visible while reviewing Dashboard.";
  await page.getByPlaceholder("What should change?").fill(feedback);
  await button("Add").click();
  await button("Copy feedback").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes(feedback));
  assert.ok(copied.includes("Dashboard"));
  assert.ok(copied.includes("Sample workforce"));
  console.log(`Agentation copied feedback:\n${copied}`);
  await button("Clear all").click();
  await button("Exit").focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await button("Start feedback mode").waitFor();
  assert.deepEqual(
    await heading("Sample workforce").first().boundingBox(),
    dashboardGeometry
  );
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
    "Agentation: keyboard open, widget heading annotation, clipboard export, clear/Escape, unchanged widget geometry and unobstructed toolbar"
  );
  await button("Edit dashboard").click();
  await button("Dashboard layout options").click();
  await button("Undo layout").waitFor();
  await button("Restore defaults").waitFor();
  await button("Dashboard layout options").click();
  await page
    .getByRole("dialog", { exact: true, name: "Dashboard layout options" })
    .waitFor({ state: "hidden" });
  await button("Add widget").click();
  await page.getByRole("dialog", { name: "Add widget" }).waitFor();
  await button("Add Auth information").click();
  const freshSettings = page.getByRole("dialog", { name: "Auth information" });
  await freshSettings.waitFor();
  await freshSettings
    .getByRole("group", { exact: true, name: "Widget width" })
    .getByText("4", { exact: true })
    .waitFor();
  await freshSettings
    .getByRole("group", { exact: true, name: "Widget height" })
    .getByText("3", { exact: true })
    .waitFor();
  assert.equal(
    await freshSettings.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return (
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= innerWidth &&
        box.bottom <= innerHeight &&
        node.scrollWidth <= node.clientWidth &&
        node.scrollHeight <= node.clientHeight
      );
    }),
    true,
    "Fresh 4×3 widget settings fit without viewport or modal overflow"
  );
  await button("Close settings").click();
  await button("Done editing dashboard").click();
  await button("Edit dashboard").waitFor();
  assert.equal(await heading("Sample workforce").count(), 2);
  await button("Edit dashboard").click();
  await button("Done editing dashboard").click();
  await button("Edit dashboard").waitFor();
  await button("Edit dashboard").click();
  await button("Edit Auth information").first().click();
  await page.getByRole("dialog", { name: "Auth information" }).waitFor();
  await button("Close settings").click();
  await button("Remove Auth information").first().click();
  await page.getByRole("dialog", { name: "Remove widget?" }).waitFor();
  await button("Cancel").click();
  await button("Add widget").click();
  await page.getByRole("dialog", { name: "Add widget" }).waitFor();
  await button("Add Auth information").click();
  await page.getByRole("dialog", { name: "Auth information" }).waitFor();
  await button("Close settings").click();
  await button("Cancel dashboard edits").click();
  const discardDashboard = page.getByRole("dialog", {
    exact: true,
    name: "Discard dashboard edits?",
  });
  await discardDashboard.waitFor();
  await discardDashboard
    .getByRole("button", { exact: true, name: "Discard edits" })
    .click();
  await button("Edit dashboard").waitFor();
  assert.equal(await heading("Sample workforce").count(), 2);
  await page.setViewportSize({ height: 776, width: 390 });
  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    await button("Edit dashboard").click();
    await button("Edit Auth information").first().click();
    await (
      (await button("Increase height").isDisabled())
        ? button("Decrease height")
        : button("Increase height")
    ).click();
    await button("Close settings").click();
    const doneDashboard = button("Done editing dashboard");
    await doneDashboard.click({ timeout: 3000, trial: true });
    assert.equal(
      await doneDashboard.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        );
      }),
      true,
      `${theme}: enabled narrow Dashboard Done is not occluded by feedback toolbar`
    );
    await doneDashboard.click();
    await button("Edit dashboard").waitFor();
  }
  await setTheme("light");
  await page.setViewportSize({ height: 900, width: 1280 });
  console.log(
    "Dashboard corners: add/done, widget settings/removal confirmation, dirty cancel/discard, narrow enabled Done in light/dark"
  );

  for (const realm of ["Workforce", "Customers"]) {
    const path = realm.toLowerCase();
    const destination = realm === "Workforce" ? "Workforce" : "Customer";
    await navigate(realm, `/${path}`);
    await navigate(`${destination} subjects`, `/${path}/subjects`);
    // Shared widget tests do not prove that these bindings filter their complete
    // subject snapshot or preserve the independent Auth realm.
    const subjects = page.getByRole("table", { exact: true, name: "Subjects" });
    await subjects.waitFor();
    assert.equal(await subjects.getByRole("row").count(), 4);
    await button("Search subjects").focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("searchbox", { exact: true, name: "Search subjects" })
      .fill("sample-subject-2");
    assert.equal(await subjects.getByRole("row").count(), 2);
    await page
      .getByRole("searchbox", { exact: true, name: "Search subjects" })
      .fill("");
    await page.keyboard.press("Escape");
    await draftTableFilter(
      "Filter subjects",
      "Realm",
      `sample-${path === "workforce" ? "customers" : "workforce"}`
    );
    assert.equal(await subjects.getByRole("row").count(), 4);
    await finishTableFilter("Cancel filters");
    assert.equal(await subjects.getByRole("row").count(), 4);
    await draftTableFilter("Filter subjects", "Subject ID", "sample-subject-2");
    await finishTableFilter();
    assert.equal(await subjects.getByRole("row").count(), 2);
    assert.equal(
      await subjects
        .getByRole("cell", { exact: true, name: `sample-${path}` })
        .count(),
      1
    );
    for (const [label, area] of [
      ["Search subjects", "topLeft"],
      ["Filter subjects: Subject ID contains sample-subject-2", "topRight"],
    ]) {
      const control = button(label);
      assert.equal(
        await control.evaluate(
          (node) => node.closest("[data-console-corner]")?.dataset.consoleCorner
        ),
        area
      );
      await control.click({ trial: true });
    }
    await clearTableFilter("Filter subjects");
    await navigate(`${destination} sessions`, `/${path}/sessions`);
    // Click-through alone cannot detect missing extracted styles or undersized targets.
    const sessions = page.getByRole("region", {
      exact: true,
      name: "Sessions",
    });
    const table = sessions.getByRole("table", {
      exact: true,
      name: "Sessions",
    });
    const rows = table.getByRole("row").filter({ has: page.getByRole("cell") });
    await link(`sample-${path}-1`).waitFor();
    for (const label of [
      "Session ID",
      "Subject ID",
      "Stored expiry (UTC)",
      "Status",
    ]) {
      const column = table.getByRole("columnheader", {
        exact: true,
        name: label,
      });
      const index = await column.evaluate((node) => node.cellIndex);
      const first = await rows
        .nth(0)
        .getByRole("cell")
        .nth(index)
        .boundingBox();
      const second = await rows
        .nth(1)
        .getByRole("cell")
        .nth(index)
        .boundingBox();
      assert.ok(
        Math.abs(first.x - second.x) < 1,
        `${label} aligns across session rows`
      );
    }
    const identity = await rows.nth(0).getByRole("cell").nth(1).boundingBox();
    const subject = await rows.nth(0).getByRole("cell").nth(2).boundingBox();
    assert.ok(
      subject.x >= identity.x + identity.width - 1 &&
        Math.abs(subject.y - identity.y) < 1,
      `Desktop session columns do not overlap and share a row: ${JSON.stringify({ identity, subject })}`
    );
    for (const control of await sessions.getByRole("button").all()) {
      const box = await control.boundingBox();
      assert.ok(
        box.height >= 44 && box.width >= 44,
        "Auth actions retain 44px targets"
      );
    }
    await button("Load more sessions").click();
    await link(`sample-${path}-3`).waitFor();
    assert.equal(await button("Load more sessions").isDisabled(), true);
    const sessionNavigation = page.getByRole("navigation", {
      name: "Session list navigation",
    });
    assert.equal(
      await sessionNavigation.evaluate(
        (node) => node.closest("[data-console-corner]")?.dataset.consoleCorner
      ),
      "bottomRight"
    );
    await sessionNavigation
      .getByText("3 sessions loaded", { exact: true })
      .waitFor();
    // The selection checkboxes control the table and the contextual Dock.
    const firstSelection = sessions.getByRole("checkbox", {
      exact: true,
      name: `Select session sample-${path}-1`,
    });
    const secondSelection = sessions.getByRole("checkbox", {
      exact: true,
      name: `Select session sample-${path}-2`,
    });
    await firstSelection.focus();
    await page.keyboard.press("Space");
    await button("Inspect session").waitFor();
    assert.equal(await firstSelection.isChecked(), true);
    assert.equal(await rows.nth(0).getAttribute("aria-selected"), "true");
    await secondSelection.click();
    assert.equal(await firstSelection.isChecked(), true);
    assert.equal(await secondSelection.isChecked(), true);
    assert.equal(await button("Inspect session").count(), 0);
    await button("Exit selection").click();
    assert.equal(await secondSelection.isChecked(), false);
    assert.equal(await rows.nth(0).getAttribute("aria-selected"), "false");
    const selectAll = sessions.getByRole("checkbox", {
      exact: true,
      name: "Select all sessions",
    });
    await selectAll.click();
    assert.equal(await firstSelection.isChecked(), true);
    assert.equal(await secondSelection.isChecked(), true);
    assert.equal(await button("Inspect session").count(), 0);
    await button("Exit selection").click();
    assert.equal(await firstSelection.isChecked(), false);
    await firstSelection.focus();
    await page.keyboard.press("Space");
    await button("Inspect session").click();
    await heading("sample-subject-1").waitFor();
    assert.equal(await button("Inspect session").count(), 0);
    await button("Revoke session").click();
    const confirmation = page.getByRole("alertdialog", {
      exact: true,
      name: "Revoke this session?",
    });
    await confirmation.waitFor();
    await confirmation.getByText(`sample-${path}-1`, { exact: true }).waitFor();
    await confirmation.getByText("sample-subject-1", { exact: true }).waitFor();
    assert.equal(
      await button("Cancel").evaluate(
        (node) => node === document.activeElement
      ),
      true
    );
    await page.keyboard.press("Shift+Tab");
    await page.waitForFunction(() =>
      document
        .querySelector('[role="alertdialog"]')
        ?.contains(document.activeElement)
    );
    assert.equal(
      await confirmation.evaluate((node) =>
        node.contains(document.activeElement)
      ),
      true,
      "Confirmation traps keyboard focus"
    );
    await button("Cancel").click();
    await confirmation.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Revoke session"
    );
    assert.equal(
      await button("Revoke session").evaluate(
        (node) => node === document.activeElement
      ),
      true
    );
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await button("Revoke session").waitFor();
    await confirmation.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Revoke session"
    );
    assert.equal(
      await button("Revoke session").evaluate(
        (node) => node === document.activeElement
      ),
      true
    );
    await page.keyboard.press("Enter");
    await button("Confirm revocation").click();
    const revokedFeedback = page.getByText("Session revoked.", { exact: true });
    await revokedFeedback.waitFor();
    await confirmation.waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Session revoked."
    );
    assert.equal(await button("Revoke session").count(), 0);
    await navigate(`${destination} sessions`, `/${path}/sessions`, "Sessions");
    await page.getByText("Revoked", { exact: true }).waitFor();
    console.log(
      `${realm}: pagination, detail, Escape/focus restore, keyboard reopen, revoke persists across navigation`
    );
  }

  await navigate("Plugins", "/plugins", "Plugin manager");
  await link("sample-auth").waitFor();
  assert.equal(await button("Inspect sample-auth").count(), 0);
  assert.equal(
    await link("sample-auth").getAttribute("href"),
    "/plugins/sample-local/sample-auth"
  );
  await link("sample-auth").focus();
  await page.keyboard.press("Enter");
  await heading("sample-auth").waitFor();
  assert.equal(
    new URL(page.url()).pathname,
    "/plugins/sample-local/sample-auth"
  );
  await button("Return to plugin list").click();
  await link("sample-auth").waitFor();
  assert.equal(new URL(page.url()).pathname, "/plugins");
  await navigate("Orders", "/orders");
  await page.getByRole("tab", { exact: true, name: "Manage" }).click();
  await page.waitForURL(`${origin}/orders/manage`);
  const orderTable = page.getByRole("table", { exact: true, name: "Orders" });
  await page
    .getByRole("checkbox", { exact: true, name: "Select order sample-order-1" })
    .check();
  await draftTableFilter("Filter orders", "Order ID", "sample-order-2");
  assert.equal(await orderTable.getByRole("row").count(), 4);
  assert.equal(
    await page
      .getByRole("checkbox", {
        exact: true,
        name: "Select order sample-order-1",
      })
      .isChecked(),
    true
  );
  await finishTableFilter("Cancel filters");
  assert.equal(
    await page
      .getByRole("checkbox", {
        exact: true,
        name: "Select order sample-order-1",
      })
      .isChecked(),
    true
  );
  await draftTableFilter("Filter orders", "Order ID", "sample-order-2");
  await finishTableFilter();
  assert.equal(await orderTable.getByRole("row").count(), 2);
  assert.equal(await button("Archive selected orders").count(), 0);
  assert.equal(
    await page
      .getByRole("checkbox", {
        exact: true,
        name: "Select order sample-order-2",
      })
      .isChecked(),
    false
  );
  await clearTableFilter("Filter orders");
  // Launcher-only coverage cannot catch Command opening detached from the Dock,
  // losing text-entry/launcher focus, or discovering unsafe selection handlers.
  await fillOrderSearch("sample-order-1");
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
  assert.equal(
    await page
      .getByRole("searchbox", { name: "Filter order IDs" })
      .inputValue(),
    ""
  );
  await button("Expand Dock").click();
  const launcherInput = page.getByLabel("Search navigation");
  await launcherInput.fill("Orders");
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Command" })
    .click();
  await commandInput.fill("Default");
  await page.keyboard.press(commandKey);
  assert.equal(await commandInput.inputValue(), "Default");
  await commandInput.press("Escape");
  assert.equal(await launcherInput.inputValue(), "Orders");
  // Restoring an icon trigger can open its focus tooltip before the launcher.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log(
    "Command: single preset, text-entry focus, scoped clear-filter, no archive discovery and launcher query restoration"
  );
  const ordersTabs = await page
    .getByRole("tablist", { name: "Orders" })
    .boundingBox();
  assert.ok(ordersTabs.height > 0 && ordersTabs.height < 44);
  assert.ok(ordersTabs.y >= 0 && ordersTabs.y < 56);
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
  const sidebarBox = await sidebar.boundingBox();
  assert.ok(
    navigationBox.x >= sidebarBox.x + sidebarBox.width + 24,
    JSON.stringify({ navigationBox, sidebarBox })
  );
  assert.ok(navigationBox.y >= 0 && navigationBox.y < 56);
  await page.setViewportSize({ height: 844, width: 390 });
  const mobileNavigationBox = await button("Console navigation").boundingBox();
  assert.ok(Math.abs(mobileNavigationBox.x - 20) < 1);
  assert.ok(
    mobileNavigationBox.x + mobileNavigationBox.width < 390,
    JSON.stringify({ mobileNavigationBox })
  );
  const mobileTabs = await page
    .getByRole("tablist", { name: "Orders" })
    .boundingBox();
  assert.ok(
    mobileNavigationBox.x + mobileNavigationBox.width <= mobileTabs.x ||
      mobileNavigationBox.y + mobileNavigationBox.height <= mobileTabs.y ||
      mobileTabs.y + mobileTabs.height <= mobileNavigationBox.y,
    JSON.stringify({ mobileNavigationBox, mobileTabs })
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
  await fillOrderSearch("sample-order-1");
  await page
    .getByRole("checkbox", { exact: true, name: "Select order sample-order-1" })
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
      .getByRole("checkbox", {
        exact: true,
        name: "Select order sample-order-1",
      })
      .isChecked(),
    true
  );
  assert.equal(await button("Console navigation").count(), 0);
  assert.equal(
    await page
      .getByRole("toolbar", { name: "Orders on this page selection actions" })
      .count(),
    1
  );
  console.log(
    "Visual regressions: compact visible tabs, actual Orders hover color, sidebar pill/main center and retained Command selection"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await button("Archive selected orders").click();
  await page.getByText("Archived 1 order.", { exact: true }).waitFor();
  await button("Clear filter order ids").click();
  assert.equal(await page.getByRole("checkbox").count(), 4);
  for (const [label, path] of [
    ["Manage", "/orders/manage"],
    ["By status", "/orders/status"],
  ]) {
    await page.getByRole("tab", { exact: true, name: label }).click();
    await page.waitForURL(`${origin}${path}`);
  }
  // Filtering the aggregate must not turn one archived order out of three into 100%.
  await draftTableFilter("Filter order statuses", "Status", "Sample: archived");
  await finishTableFilter();
  const distribution = page.getByRole("table", {
    exact: true,
    name: "Order status distribution",
  });
  assert.equal(await distribution.getByRole("row").count(), 2);
  assert.equal(
    await distribution.getByRole("cell", { exact: true, name: "33%" }).count(),
    1
  );
  await clearTableFilter("Filter order statuses");
  await page.getByRole("tab", { exact: true, name: "Manage" }).click();
  await page.waitForURL(`${origin}/orders/manage`);
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
  await link("sample-order-1").click();
  assertContextTravel(await intoObject, "tabs→object");
  await page.getByRole("region", { name: "Order details" }).waitFor();
  const objectContext = page.locator('[aria-label="Task context"]');
  const objectLabel = await objectContext.textContent();
  assert.ok(objectLabel.includes("sample-order-1"));
  assert.equal(await page.getByRole("tablist", { name: "Orders" }).count(), 0);
  const intoTabs = sampleContext();
  await button("Return to orders").click();
  assertContextTravel(await intoTabs, "object→tabs");
  await page.waitForURL(`${origin}/orders/manage`);
  await page.getByRole("tablist", { name: "Orders" }).waitFor();
  const tabsBox = await page
    .getByRole("tablist", { name: "Orders" })
    .boundingBox();
  assert.ok(tabsBox.y < 56);
  await link("sample-order-1").press("Enter");
  await page.getByRole("region", { name: "Order details" }).waitFor();
  assert.equal(
    await page
      .locator("[data-context-body-surface]")
      .getAttribute("data-travelling"),
    "false"
  );
  assert.equal(await objectContext.locator("[data-gooey-svg]").count(), 0);
  await button("Return to orders").press("Enter");
  await page.getByRole("tablist", { name: "Orders" }).waitFor();
  assert.equal(
    await page
      .locator("[data-context-body-surface]")
      .getAttribute("data-travelling"),
    "false"
  );
  for (let turn = 0; turn < 2; turn += 1) {
    await link("sample-order-1").click();
    await button("Return to orders").click();
    await page.getByRole("tablist", { name: "Orders" }).waitFor();
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

  await navigate("Dashboard", "/");
  assert.equal(await heading("Sample workforce").count(), 2);
  await button("Expand Dock").waitFor();
  const light = await page
    .locator("body")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.equal(
    await page
      .getByRole("complementary", { name: "Local sample preview" })
      .count(),
    0
  );
  await setTheme("dark");
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
  // The restored icon's tooltip is dismissed before the directory itself.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  for (const [label, path, title] of [
    ["Plugins", "/plugins", "Plugin manager"],
    ["Workforce sessions", "/workforce/sessions", "Sessions"],
    ["Customer subjects", "/customers/subjects", "Subjects"],
    ["Orders", "/orders"],
    ["Dashboard", "/"],
  ]) {
    await navigate(label, path, title);
    if (label === "Workforce sessions") {
      // Normal sample IDs cannot expose wrapping that pushes the final action behind a corner.
      const sessionLink = page
        .getByRole("region", { exact: true, name: "Sessions" })
        .getByRole("link")
        .first();
      const originalId = await sessionLink.textContent();
      await sessionLink.evaluate(
        (node) => (node.textContent = `stress-identifier-${"x".repeat(160)}`)
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      await page.evaluate(() =>
        scrollTo(0, document.documentElement.scrollHeight)
      );
      await button("Load more sessions").focus();
      assert.equal(
        await button("Load more sessions").evaluate((node) => {
          const r = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          );
        }),
        true
      );
      await sessionLink.evaluate(
        (node, text) => (node.textContent = text),
        originalId
      );
      await page.evaluate(() => scrollTo(0, 0));
    }
    if (label === "Orders") {
      await page.getByRole("tab", { exact: true, name: "Manage" }).click();
      await page.waitForURL(`${origin}/orders/manage`);
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
        .getByRole("checkbox", {
          exact: true,
          name: "Select order sample-order-2",
        })
        .check();
      await settleImmediateSurface();
      const mobileSelection = await page
        .locator("[data-dashboard-dock-surface]")
        .boundingBox();
      await page.keyboard.press(commandKey);
      await commandInput.waitFor();
      await commandInput.press("Escape");
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
      await link("sample-order-1").click();
      await page.getByRole("region", { name: "Order details" }).waitFor();
      for (const theme of ["light", "dark"]) {
        await setTheme(theme);
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
  await heading("Sample workforce").waitFor();
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
  await touchPage
    .getByRole("button", { exact: true, name: "Edit dashboard" })
    .tap();
  const dashboardCornerControls = [
    "Add widget",
    "Dashboard layout options",
  ].map((name) => touchPage.getByRole("button", { exact: true, name }));
  for (const control of dashboardCornerControls) {
    assert.equal(
      await control.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.width >= 44 &&
          rect.height >= 44 &&
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          node.contains(
            document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2
            )
          )
        );
      }),
      true,
      "Dashboard bottom-left corner controls are coarse-pointer targets"
    );
  }
  const leftCornerGeometry = await Promise.all(
    dashboardCornerControls.map((control) => control.boundingBox())
  );
  assert.ok(
    leftCornerGeometry.every(
      (rect) => rect.x < 195 && rect.y + rect.height > 744
    ),
    `Dashboard editing controls remain grouped at the bottom-left: ${JSON.stringify(leftCornerGeometry)}`
  );
  const dockDashboardControls = await touchPage
    .getByRole("navigation", { name: "Pinned navigation" })
    .getByRole("button")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label"))
    );
  assert.ok(
    dockDashboardControls.every(
      (name) =>
        ![
          "Add widget",
          "Dashboard layout options",
          "Undo layout",
          "Restore defaults",
        ].includes(name)
    ),
    "Dashboard corner actions do not contribute controls to the Dock"
  );
  await dashboardCornerControls[1].tap();
  const dashboardOptions = touchPage.getByRole("dialog", {
    name: "Dashboard layout options",
  });
  await dashboardOptions.waitFor();
  for (const name of ["Undo layout", "Restore defaults"]) {
    const control = dashboardOptions.getByRole("button", {
      exact: true,
      name,
    });
    await control.waitFor();
    assert.equal(
      await control.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const disabled =
          node.disabled || node.getAttribute("aria-disabled") === "true";
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          (disabled ||
            node.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2
              )
            ))
        );
      }),
      true,
      `${name} remains reachable from the Dashboard layout options popover`
    );
  }
  await touchPage.keyboard.press("Escape");
  await dashboardOptions.waitFor({ state: "hidden" });
  await touchPage
    .getByRole("button", { exact: true, name: "Done editing dashboard" })
    .tap();
  await touchPage
    .getByRole("button", { exact: true, name: "Edit dashboard" })
    .waitFor();
  console.log(
    "Dashboard touch corners: 44px bottom-left targets, reachable layout options, Dock remains Dashboard-free"
  );
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
