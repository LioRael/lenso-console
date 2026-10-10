import {
  bindConsole,
  defineConsolePlugin,
  type ConsoleLocalPageProps,
} from "../src/composition";
import type { ConsoleShellProps } from "../src/console-shell";

const strings = defineConsolePlugin<{ read(): Promise<string> }>({
  id: "strings",
  pages: {
    home: {
      component: ({
        services,
      }: ConsoleLocalPageProps<{ read(): Promise<string> }>) => {
        void services.read();
        return null;
      },
    },
  },
});
const numbers = defineConsolePlugin<{ read(): number }>({
  id: "numbers",
  pages: { home: { component: () => null } },
});
const plugins: ConsoleShellProps["plugins"] = [
  bindConsole(strings, {
    id: "strings",
    routes: { home: "/" },
    services: { read: async () => "value" },
  }),
  bindConsole(numbers, {
    id: "numbers",
    routes: { home: "/numbers" },
    services: { read: () => 3 },
  }),
];
void plugins;
bindConsole(strings, {
  id: "wrong",
  routes: { home: "/" },
  // @ts-expect-error services remain typed at the binding boundary.
  services: { read: () => 3 },
});
