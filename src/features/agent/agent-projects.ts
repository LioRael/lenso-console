import { sessionFetch } from "../../lib/session-fetch";
import { agentApiUrl } from "./agent-runtime";

export type OpenedProject = { id: string; path: string };
export type OpenedProjects = {
  defaultPath: string;
  projects: OpenedProject[];
};

export async function requestProjects<T>(
  path: string,
  body?: { path: string }
): Promise<T> {
  const response = await sessionFetch(agentApiUrl("app", `projects${path}`), {
    headers: {
      "x-lenso-console-projects": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined);
    throw new Error(error?.detail ?? "Projects are unavailable");
  }
  return response.json();
}

export function listOpenedProjects(): Promise<OpenedProjects> {
  return requestProjects("");
}
