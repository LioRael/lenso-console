import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

// Warm previews miss the upstream conditional export: compiled JS can be paired
// with comment-only source CSS. Vite's built-in alias runs before this fallback.
const sourceStyles = "\0composed-empty-source-styles.css";
const cacheDir = await mkdtemp(join(tmpdir(), "composed-preview-styles-"));
let server;
let browser;

try {
  server = await createServer({
    cacheDir,
    configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)),
    plugins: [
      {
        enforce: "pre",
        load(id) {
          if (id === sourceStyles) {
            return "/* Source JS emits StyleX styles; no compiled CSS here. */";
          }
        },
        name: "conditional-console-source-styles-fixture",
        resolveId(id) {
          if (id === "@lenso/console-react/styles.css") {
            return sourceStyles;
          }
        },
      },
    ],
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });

  for (const touch of [false, true]) {
    for (const theme of ["light", "dark"]) {
      const label = `${touch ? "coarse 390x844" : "desktop 1280x900"} ${theme}`;
      const context = await browser.newContext({
        hasTouch: touch,
        isMobile: touch,
        reducedMotion: "reduce",
        viewport: touch
          ? { height: 844, width: 390 }
          : { height: 900, width: 1280 },
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("requestfailed", (request) =>
          errors.push(`requestfailed: ${request.url()}`)
        );
        page.on("response", (response) => {
          if (response.status() >= 400) {
            errors.push(`${response.status()} ${response.url()}`);
          }
        });
        const button = (name) =>
          page.getByRole("button", { exact: true, name });
        const edit = button("Edit dashboard");
        const done = button("Done editing dashboard");
        const cancel = button("Cancel dashboard edits");
        await page.goto(`${origin}/?theme=${theme}`);
        await edit.click();
        await done.waitFor();
        await cancel.waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.theme),
          theme,
          `${label}: real host applies requested theme`
        );
        assert.equal(
          await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
          touch,
          `${label}: real pointer media condition`
        );
        const [doneBox, cancelBox] = await Promise.all([
          done.boundingBox(),
          cancel.boundingBox(),
        ]);
        assert.ok(doneBox && cancelBox, `${label}: editing actions visible`);
        assert.ok(
          doneBox.x + doneBox.width <= cancelBox.x ||
            cancelBox.x + cancelBox.width <= doneBox.x ||
            doneBox.y + doneBox.height <= cancelBox.y ||
            cancelBox.y + cancelBox.height <= doneBox.y,
          `${label}: Done and Cancel must not overlap: ${JSON.stringify({ cancelBox, doneBox })}`
        );
        for (const control of [done, cancel]) {
          assert.equal(
            await control.evaluate((node) => {
              const r = node.getBoundingClientRect();
              return (
                r.left >= 0 &&
                r.top >= 0 &&
                r.right <= innerWidth &&
                r.bottom <= innerHeight &&
                node.contains(
                  document.elementFromPoint(
                    r.x + r.width / 2,
                    r.y + r.height / 2
                  )
                )
              );
            }),
            true,
            `${label}: editing action is in viewport and unobstructed`
          );
        }
        // Ordinary actionability/clicks, never force clicks or CSS overrides.
        await done.click();
        await edit.waitFor();
        await edit.click();
        await cancel.click();
        await edit.waitFor();

        await page.goto(
          `${origin}/workforce/sessions/sample-workforce-1?theme=${theme}`
        );
        const returning = button("Return to sessions");
        await returning.waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.theme),
          theme,
          `${label}: detail retains requested theme`
        );
        let keyboardFocused = false;
        for (let index = 0; index < 40; index += 1) {
          await page.keyboard.press("Tab");
          keyboardFocused = await returning.evaluate(
            (node) => document.activeElement === node
          );
          if (keyboardFocused) {
            break;
          }
        }
        assert.ok(keyboardFocused, `${label}: Tab reaches Return to sessions`);
        const focus = await returning.evaluate((node) => {
          const style = getComputedStyle(node);
          const r = node.getBoundingClientRect();
          const width = Number(style.outlineWidth.replace("px", ""));
          const offset = Number(style.outlineOffset.replace("px", ""));
          const inset = -(offset + width / 2);
          const points = [
            [r.left + inset, r.top + r.height / 2],
            [r.right - inset, r.top + r.height / 2],
            [r.left + r.width / 2, r.top + inset],
            [r.left + r.width / 2, r.bottom - inset],
          ];
          const clips = [];
          for (
            let parent = node.parentElement;
            parent;
            parent = parent.parentElement
          ) {
            const css = getComputedStyle(parent);
            const bounds = parent.getBoundingClientRect();
            if (css.overflowX !== "visible" || css.overflowY !== "visible") {
              clips.push({
                bottom: bounds.top + parent.clientTop + parent.clientHeight,
                left: bounds.left + parent.clientLeft,
                right: bounds.left + parent.clientLeft + parent.clientWidth,
                top: bounds.top + parent.clientTop,
              });
            }
            if (css.clipPath.startsWith("inset(")) {
              const values = css.clipPath
                .slice(6)
                .split(" round ")[0]
                .replace(")", "")
                .trim()
                .split(/\s+/u)
                .map((value) => Number(value.replace("px", "")));
              const [top, right = top, bottom = top, left = right] = values;
              clips.push({
                bottom: bounds.bottom - bottom,
                left: bounds.left + left,
                right: bounds.right - right,
                top: bounds.top + top,
              });
            }
          }
          return {
            color: style.outlineColor,
            offset,
            retained: points.every(
              ([x, y]) =>
                x >= 0 &&
                y >= 0 &&
                x < innerWidth &&
                y < innerHeight &&
                clips.every(
                  (clip) =>
                    x >= clip.left &&
                    x <= clip.right &&
                    y >= clip.top &&
                    y <= clip.bottom
                ) &&
                node.contains(document.elementFromPoint(x, y))
            ),
            style: style.outlineStyle,
            visible: node.matches(":focus-visible"),
            width,
          };
        });
        assert.ok(focus.visible, `${label}: Return is keyboard focus-visible`);
        assert.equal(
          focus.style,
          "solid",
          `${label}: visible Return focus ring`
        );
        assert.ok(focus.width > 0, `${label}: Return ring has painted width`);
        assert.ok(
          focus.color !== "transparent" && !/,\s*0\)$/u.test(focus.color),
          `${label}: Return ring is not transparent`
        );
        assert.ok(
          focus.offset + focus.width <= 0,
          `${label}: entire Return ring is inset inside its clipped cap`
        );
        assert.ok(
          focus.retained,
          `${label}: clips and overlays retain all four ring edges`
        );
        await page.keyboard.press("Enter");
        await page.waitForURL(`${origin}/workforce/sessions`);
        assert.equal(await returning.count(), 0);
        assert.deepEqual(errors, [], `${label}: no browser or request errors`);
        console.log(
          `${label} PASS: Done/Cancel separate and clickable; keyboard Return ring inset, unclipped, unobstructed; Enter returns to sessions.`
        );
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(cacheDir, { force: true, recursive: true });
}
