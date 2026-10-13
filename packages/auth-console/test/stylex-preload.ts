import stylex from "@stylexjs/unplugin";
import { plugin } from "bun";

// Lower real StyleX imports in Bun tests; browser checks prove extracted geometry.
const transform = stylex.raw(
  { dev: false, runtimeInjection: true, devPersistToDisk: false },
  { framework: "bun" }
);
const hook = transform.transform;
const transformSource = typeof hook === "function" ? hook : hook?.handler;

await plugin({
  name: "auth-console-test-stylex",
  setup(build) {
    build.onLoad(
      { filter: /\/packages\/auth-console\/src\/.*\.[jt]sx?$/ },
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
