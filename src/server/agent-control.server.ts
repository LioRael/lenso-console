const controlPath = "/api/console/v1/agent/control/tool-policy";
const responseBodyLimit = 64 * 1024;

type AgentControlEnvironment = {
  LENSO_CONSOLE_AGENT_CONTROL_TOKEN?: string | undefined;
  LENSO_CONSOLE_AGENT_URL?: string | undefined;
};

type AgentControlDependencies = {
  fetch?: typeof fetch;
};

export async function proxyAgentControlRequest(
  request: Request,
  environment: AgentControlEnvironment = process.env,
  dependencies: AgentControlDependencies = {}
): Promise<Response> {
  try {
    const target = controlTarget(environment);
    const body = request.method === "PUT" ? await request.text() : undefined;
    const response = await (dependencies.fetch ?? fetch)(target.url, {
      ...(body === undefined ? {} : { body }),
      headers: {
        Accept: "application/json, application/problem+json",
        Authorization: `Bearer ${target.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      method: request.method,
      signal: AbortSignal.timeout(3000),
    });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > responseBodyLimit) {
      return problem(502, "Agent Tool policy response exceeded 64 KiB");
    }
    return new Response(bytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
      status: response.status,
    });
  } catch (error) {
    return problem(
      502,
      error instanceof Error
        ? error.message
        : "Agent Tool policy is unavailable"
    );
  }
}

function controlTarget(environment: AgentControlEnvironment) {
  const value = environment.LENSO_CONSOLE_AGENT_URL;
  const token = environment.LENSO_CONSOLE_AGENT_CONTROL_TOKEN;
  if (!value) {
    throw new Error("LENSO_CONSOLE_AGENT_URL is not configured");
  }
  if (!token) {
    throw new Error("LENSO_CONSOLE_AGENT_CONTROL_TOKEN is not configured");
  }
  const url = new URL(value);
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (
    url.protocol !== "http:" ||
    !loopback ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "LENSO_CONSOLE_AGENT_URL must be a clean loopback HTTP origin"
    );
  }
  url.pathname = controlPath;
  return { token, url };
}

function problem(status: number, detail: string) {
  return Response.json(
    {
      detail,
      status,
      title: "Agent Control unavailable",
      type: "about:blank",
    },
    {
      headers: { "Cache-Control": "no-store" },
      status,
    }
  );
}
