const requestBodyLimit = 64 * 1024;

type AgentHarnessEnvironment = {
  LENSO_CONSOLE_AGENT_URL?: string | undefined;
};

type AgentHarnessDependencies = {
  fetch?: typeof fetch;
};

export async function proxyAgentHarnessRequest(
  request: Request,
  environment: AgentHarnessEnvironment = process.env,
  dependencies: AgentHarnessDependencies = {}
) {
  const routeError = validateAgentRoute(request);
  if (routeError) {
    return routeError;
  }
  try {
    const target = agentHarnessUrl(request, environment);
    const body = await requestBody(request);
    const response = await (dependencies.fetch ?? fetch)(target, {
      ...(body === undefined ? {} : { body }),
      headers: forwardedHeaders(request.headers),
      method: request.method,
      signal: request.signal,
    });
    return new Response(response.body, {
      headers: responseHeaders(response.headers),
      status: response.status,
    });
  } catch (error) {
    return Response.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Agent Harness is unavailable",
        status: 502,
        title: "Agent Harness unavailable",
        type: "about:blank",
      },
      { status: 502 }
    );
  }
}

function validateAgentRoute(request: Request) {
  const path = new URL(request.url).pathname;
  const getRoute =
    path === "/api/console/v1/agent/bootstrap" ||
    path === "/api/console/v1/agent/sessions" ||
    /^\/api\/console\/v1\/agent\/sessions\/[^/]+(?:\/trajectory)?$/u.test(
      path
    ) ||
    /^\/api\/console\/v1\/agent\/turns\/[^/]+\/interactions$/u.test(path);
  const postRoute =
    path === "/api/console/v1/agent/turns" ||
    /^\/api\/console\/v1\/agent\/turns\/[^/]+\/cancel$/u.test(path) ||
    /^\/api\/console\/v1\/agent\/turns\/[^/]+\/interactions\/[^/]+\/answer$/u.test(
      path
    );

  if (!(getRoute || postRoute)) {
    return Response.json(
      { detail: "Agent route not found", status: 404, title: "Not found" },
      { status: 404 }
    );
  }
  const allowedMethod = getRoute ? "GET" : "POST";
  if (request.method !== allowedMethod) {
    return Response.json(
      {
        detail: `Agent route requires ${allowedMethod}`,
        status: 405,
        title: "Method not allowed",
      },
      { headers: { Allow: allowedMethod }, status: 405 }
    );
  }
  return undefined;
}

function agentHarnessUrl(
  request: Request,
  environment: AgentHarnessEnvironment
) {
  const value = environment.LENSO_CONSOLE_AGENT_URL;
  if (!value) {
    throw new Error("LENSO_CONSOLE_AGENT_URL is not configured");
  }
  const origin = new URL(value);
  const loopback =
    origin.hostname === "localhost" ||
    origin.hostname === "127.0.0.1" ||
    origin.hostname === "[::1]";
  if (
    origin.protocol !== "http:" ||
    !loopback ||
    origin.username ||
    origin.password ||
    (origin.pathname !== "/" && origin.pathname !== "") ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "LENSO_CONSOLE_AGENT_URL must be a clean loopback HTTP origin"
    );
  }
  const incoming = new URL(request.url);
  origin.pathname = incoming.pathname;
  origin.search = incoming.search;
  return origin;
}

async function requestBody(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > requestBodyLimit) {
    throw new Error("Agent request exceeded 64 KiB");
  }
  return bytes;
}

function forwardedHeaders(headers: Headers) {
  const forwarded = new Headers();
  for (const name of ["accept", "content-type", "last-event-id"]) {
    const value = headers.get(name);
    if (value) {
      forwarded.set(name, value);
    }
  }
  return forwarded;
}

function responseHeaders(headers: Headers) {
  const forwarded = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["content-type", "last-event-id"]) {
    const value = headers.get(name);
    if (value) {
      forwarded.set(name, value);
    }
  }
  return forwarded;
}
