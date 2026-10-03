import { problemMessage } from "../../lib/http-problem";
import { sessionFetch } from "../../lib/session-fetch";

export type AssistantProvider = { id: string; label: string; model: string };
export type AssistantSettings = {
  providers: AssistantProvider[];
  selected_provider_id: string | null;
  byok_enabled: boolean;
  has_byok: boolean;
};
export type AssistantSettingsUpdate = {
  provider_id: string | null;
  byok?: { provider_id: string; api_key: string } | null;
};

export class AssistantSettingsError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AssistantSettingsError";
    this.status = status;
  }
}

const endpoint = "/api/console/v1/assistant/settings";

export async function readAssistantSettings(
  subject: string,
  signal?: AbortSignal
) {
  const response = await sessionFetch(endpoint, {
    cache: "no-store",
    headers: { "x-lenso-expected-subject": subject },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new AssistantSettingsError(
      await problemMessage(response, "Assistant settings could not be loaded."),
      response.status
    );
  }
  return parseAssistantSettings(await response.json());
}

export async function updateAssistantSettings(
  subject: string,
  update: AssistantSettingsUpdate,
  signal?: AbortSignal
) {
  const response = await sessionFetch(endpoint, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-lenso-expected-subject": subject,
    },
    ...(signal ? { signal } : {}),
    body: JSON.stringify(update),
  });
  if (!response.ok) {
    throw new AssistantSettingsError(
      await problemMessage(response, "Assistant settings could not be saved."),
      response.status
    );
  }
}

function parseAssistantSettings(value: unknown): AssistantSettings {
  if (!value || typeof value !== "object") {
    throw new Error("Assistant settings are unavailable.");
  }
  const object = value as Record<string, unknown>;
  if (
    !Array.isArray(object.providers) ||
    !(
      object.selected_provider_id === null ||
      typeof object.selected_provider_id === "string"
    ) ||
    typeof object.byok_enabled !== "boolean" ||
    typeof object.has_byok !== "boolean"
  ) {
    throw new Error("Assistant settings are unavailable.");
  }
  const providers = object.providers.map((provider: unknown) => {
    if (!provider || typeof provider !== "object") {
      throw new Error("Assistant providers are unavailable.");
    }
    const entry = provider as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      !entry.id ||
      typeof entry.label !== "string" ||
      typeof entry.model !== "string"
    ) {
      throw new Error("Assistant providers are unavailable.");
    }
    // Only the public summary enters the query cache; no credential fields.
    return { id: entry.id, label: entry.label, model: entry.model };
  });
  return {
    providers,
    selected_provider_id: object.selected_provider_id,
    byok_enabled: object.byok_enabled,
    has_byok: object.has_byok,
  };
}
