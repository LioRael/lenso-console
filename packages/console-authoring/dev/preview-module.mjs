/** Browser-only preview adapters; no service module is evaluated on the server. */
export function previewModule({ workspaces, pages, backend, examples }) {
  const mounts = workspaces.map((workspace) => ({
    apiMajor: 1,
    id: workspace.id,
    pageId: workspace.id,
    title: workspace.title,
    basePath: workspace.path,
    access: workspace.access,
    index: workspace.index,
    routes: pages
      .filter((page) => page.workspace === workspace)
      .map((page) => page.segments),
    module: `preview:${workspace.id}`,
    styles: [],
    revision: "local-preview",
    owner: {
      instance: `preview.${workspace.id}`,
      source: "development-filesystem",
      trusted: false,
    },
    subject: { kind: "console" },
    requirements: [],
    navigation: {
      label: workspace.title,
      items: pages
        .filter(
          (page) =>
            page.workspace === workspace &&
            !page.segments.some((s) => s.startsWith("["))
        )
        .map((page) => ({
          label: page.segments.at(-1) || "Home",
          path: page.segments,
        })),
    },
  }));
  return `${examples ? `import examples from ${JSON.stringify(examples)};` : "const examples = undefined;"}
export const isUiPreview = ${!backend};
export const previewMounts = ${JSON.stringify(mounts)};
const ids = new Set(previewMounts.map(mount => mount.pageId));
export const isPreviewMount = mount => ids.has(mount.pageId ?? mount.id);
export const selectPreviewMounts = mounts => mounts.filter(isPreviewMount);
export function exampleServices(lifetime) {
  const requireExample = (kind, service, operation, input, options) => {
    const signals = [lifetime, options?.signal].filter(Boolean);
    const signal = signals.length ? AbortSignal.any(signals) : undefined;
    signal?.throwIfAborted();
    if (typeof examples?.[kind] !== "function") throw new Error("No example data configured for " + service + "/" + operation + ". Pass --examples with an explicit browser WorkspaceServices module, or connect a compatible backend.");
    return {signal, value: examples[kind](service, operation, input, {...options, signal})};
  };
  return {
    async invoke(service, operation, input, options) { const result = requireExample("invoke", service, operation, input, options); const value = await result.value; result.signal?.throwIfAborted(); return value; },
    async *subscribe(service, operation, input, options) { const result = requireExample("subscribe", service, operation, input, options); for await (const item of result.value) { result.signal?.throwIfAborted(); yield item; } }
  };
}
`;
}
