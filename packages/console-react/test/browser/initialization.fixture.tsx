import { Button } from "@lenso/ui/button";
import { Description } from "@lenso/ui/description";
import { FieldError } from "@lenso/ui/field-error";
import { Form } from "@lenso/ui/form";
import { Input } from "@lenso/ui/input";
import { Label } from "@lenso/ui/label";
import { TextField } from "@lenso/ui/textfield";
import {
  StrictMode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import {
  ConsoleInitialization,
  ConsoleShell,
  bindConsole,
  defineConsolePlugin,
  type ConsoleInitializationFormProps,
  type ConsoleLocalPageProps,
  type ConsoleInitializationClient,
} from "../../dist/index.js";
import "@fontsource-variable/inter";

import "@lenso/tokens/styles.css";
import "../../../../plugins/console/shell/src/styles.css";
import "../../dist/styles.css";

type InputData = { username: string; password: string; providerKey: string };
type Draft = { username: string };
const DraftContext = createContext<{
  draft: Draft;
  handleDraftChange(draft: Draft): void;
  requestId: string;
  scope: string;
  platform: "native" | "workers";
} | null>(null);

// App-owned example of task 61's native input contract. No generic field schema.
function NativeForm({
  draft,
  onDraftChange,
  onSubmit,
}: ConsoleInitializationFormProps<InputData, Draft>) {
  const [password, setPassword] = useState("");
  const [providerKey, setProviderKey] = useState("");
  return (
    <Form
      aria-label="Native first owner"
      onFormSubmit={() =>
        void onSubmit({ username: draft.username, password, providerKey })
      }
    >
      <TextField name="username">
        <Label required>Owner name</Label>
        <Input
          required
          minLength={2}
          value={draft.username}
          onChange={(event) => onDraftChange({ username: event.target.value })}
        />
        <FieldError />
      </TextField>
      <TextField name="password">
        <Label required>Owner password</Label>
        <Input
          required
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Description>
          At least 12 characters. Cleared when this form closes.
        </Description>
        <FieldError />
      </TextField>
      <TextField name="providerKey">
        <Label required>Provider key</Label>
        <Input
          required
          type="password"
          autoComplete="off"
          value={providerKey}
          onChange={(event) => setProviderKey(event.target.value)}
        />
        <Description>No model or billing request is made by setup.</Description>
        <FieldError />
      </TextField>
      <Button type="submit" variant="primary" size="lg">
        Create first owner
      </Button>
    </Form>
  );
}
function SetupPage({
  services,
  signal,
}: ConsoleLocalPageProps<{ client: ConsoleInitializationClient<InputData> }>) {
  const owner = useContext(DraftContext)!;
  return (
    <ConsoleInitialization
      scopeKey={owner.scope}
      signal={signal}
      target={{ label: "Isolated example instance", platform: owner.platform }}
      client={services.client}
      requestId={owner.requestId}
      draft={owner.draft}
      onDraftChange={owner.handleDraftChange}
      form={NativeForm}
      repair={{
        label: "Existing deployment owner instructions",
        href: "#deployment-owner",
      }}
    />
  );
}
const definition = defineConsolePlugin({
  id: "first-run-example",
  pages: { setup: { component: SetupPage } },
  settings: [
    {
      id: "initialization",
      page: "setup",
      label: "Application setup",
      description: "Initialize or resume this instance",
      group: { id: "general", label: "General" },
    },
  ],
});

function Fixture() {
  const [pathname, setPathname] = useState("/settings");
  const [scope, setScope] = useState("first");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<Draft>({ username: "" });
  const [platform, setPlatform] = useState<"native" | "workers">("native");
  const client = useMemo<ConsoleInitializationClient<InputData>>(() => {
    const call = async (
      action: string,
      signal: AbortSignal,
      body?: unknown
    ) => {
      const response = await fetch(`/__test_initialization/${action}`, {
        method: action === "status" ? "GET" : "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-test-instance": scope,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error("Setup request failed"), {
          code: result.code,
        });
      }
      return result;
    };
    return {
      status: ({ signal }) => call("status", signal),
      apply: (request, { signal }) => call("apply", signal, request),
      activate: ({ signal }) => call("activate", signal),
    };
  }, [scope]);
  const plugins = useMemo(
    () => [
      bindConsole(definition, {
        id: "first-run",
        services: { client },
        routes: { setup: "/setup" },
      }),
    ],
    [client]
  );
  Object.assign(window, {
    initializationFixture: {
      navigate: setPathname,
      platform: setPlatform,
      scope(next: string) {
        setDraft({ username: "" });
        setRequestId(crypto.randomUUID());
        setScope(next);
      },
      requestId: () => requestId,
    },
  });
  return (
    <DraftContext.Provider
      value={{ draft, handleDraftChange: setDraft, scope, requestId, platform }}
    >
      <ConsoleShell
        plugins={plugins}
        settings={{}}
        router={{
          pathname,
          navigate: setPathname,
          match: (pattern, path) => (pattern === path ? {} : null),
        }}
      />
    </DraftContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>
);

declare global {
  interface Window {
    initializationFixture: {
      navigate(path: string): void;
      platform(platform: "native" | "workers"): void;
      scope(scope: string): void;
      requestId(): string;
    };
  }
}
