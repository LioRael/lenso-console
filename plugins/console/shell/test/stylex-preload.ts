import stylex from "@stylexjs/unplugin";
import { plugin } from "bun";

// Bun's import.meta.env reads process.env; Vite supplies this base in production.
process.env.BASE_URL = "/";

// Unit imports still execute real StyleX lowering; CSS geometry belongs to
// the Playwright fixtures, which use Console's Vite extraction plugin.
const transform = stylex.raw(
  { dev: false, runtimeInjection: true, devPersistToDisk: false },
  { framework: "bun" }
);
const hook = transform.transform;
const transformSource = typeof hook === "function" ? hook : hook?.handler;

await plugin({
  name: "console-test-stylex",
  setup(build) {
    build.onLoad(
      {
        filter:
          /\/(?:plugins\/console\/shell|packages\/console-(?:react|dashboard|plugin-manager))\/.*\.[jt]sx?$/,
      },
      async ({ path }) => {
        const source = await Bun.file(path).text();
        const result = transformSource
          ? await Reflect.apply(transformSource, transform, [source, path])
          : null;
        return { contents: result?.code ?? source, loader: "tsx" };
      }
    );
  },
});
