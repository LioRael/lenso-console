export const visualThemes = ["dark", "light"];

export const visualViewports = [
  { height: 900, width: 1440 },
  { height: 800, width: 1280 },
  { height: 768, width: 1024 },
];

const hostRoutes = [
  { id: "home", path: "/" },
  { id: "system", path: "/system" },
  { id: "changes", path: "/changes" },
  { id: "runtime", path: "/runtime" },
  { id: "delivery", path: "/delivery" },
  { id: "modules", path: "/modules" },
  { id: "settings", path: "/settings" },
];

const extensionRoutes = [
  { id: "identity", path: "/data/identity" },
  { id: "crm-contacts", path: "/data/remote-crm" },
  { id: "crm-companies", path: "/data/remote-crm/companies" },
  { id: "managed-services", path: "/system/services" },
  { id: "auth", path: "/auth" },
  { id: "auth-users", path: "/auth/users" },
  { id: "auth-sessions", path: "/auth/sessions" },
  { id: "auth-credentials", path: "/auth/credentials" },
  { id: "auth-providers", path: "/auth/providers" },
  { id: "auth-github", path: "/auth/providers/github" },
  { id: "auth-google", path: "/auth/providers/google" },
  { id: "auth-oidc", path: "/auth/providers/oidc" },
];

export const storyViewModes = [
  "story",
  "graph",
  "timeline",
  "waterfall",
  "flame",
  "heatmap",
];

export const storyInspectorTabs = [
  "overview",
  "payload",
  "logs",
  "events",
  "operations",
];

const storyCorrelation = "corr_resource_published_fanout";
const storyNode = "resource_version_published";

export const buildVisualMatrix = () => {
  const staticCases = [...hostRoutes, ...extensionRoutes].flatMap((route) =>
    visualThemes.flatMap((theme) =>
      visualViewports.map((viewport) => ({
        kind: "route",
        route: route.id,
        theme,
        url: route.path,
        viewport,
      }))
    )
  );

  const storyCases = storyViewModes.flatMap((view) =>
    visualThemes.flatMap((theme) =>
      visualViewports.flatMap((viewport) => [
        {
          inspector: "closed",
          kind: "story",
          route: `stories-${view}-closed`,
          theme,
          url: `/stories?story=${storyCorrelation}&view=${view}`,
          viewport,
        },
        ...storyInspectorTabs.map((tab) => ({
          inspector: tab,
          kind: "story",
          route: `stories-${view}-${tab}`,
          theme,
          url: `/stories?node=${storyNode}&story=${storyCorrelation}&tab=${tab}&view=${view}`,
          viewport,
        })),
      ])
    )
  );

  return [...staticCases, ...storyCases];
};

export const matrixSummary = (cases = buildVisualMatrix()) => ({
  cases: cases.length,
  inspectorStates: new Set(
    cases.filter((item) => item.kind === "story").map((item) => item.inspector)
  ).size,
  routes: new Set(cases.map((item) => item.route)).size,
  themes: new Set(cases.map((item) => item.theme)).size,
  viewports: new Set(
    cases.map((item) => `${item.viewport.width}x${item.viewport.height}`)
  ).size,
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(buildVisualMatrix(), null, 2));
} else {
  console.log(JSON.stringify(matrixSummary()));
}
