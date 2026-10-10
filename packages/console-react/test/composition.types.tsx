import {
  bindConsole,
  defineConsolePlugin,
  type ConsoleDockViewProps,
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
  dockViews: [
    {
      id: "draft",
      label: "Draft",
      icon: null,
      component: ({
        services,
        dock,
      }: ConsoleDockViewProps<{ read(): Promise<string> }>) => {
        const result: Promise<string> = services.read();
        const changed: boolean = dock.expand();
        dock.requestExit("back-button");
        // @ts-expect-error exit reasons are a closed public contract.
        dock.requestExit("dismiss");
        void result;
        void changed;
        return null;
      },
    },
  ],
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

defineConsolePlugin<{ read(): string }>({
  id: "wrong-dock",
  pages: {},
  dockViews: [
    {
      id: "draft",
      label: "Draft",
      icon: null,
      // @ts-expect-error Dock components share the binding's exact service contract.
      component: (_props: ConsoleDockViewProps<{ read(): number }>) => null,
    },
  ],
});
