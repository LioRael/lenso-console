// oxlint-disable typescript/consistent-type-imports -- Ambient virtual modules must not become module augmentations.
declare module "*.css";
declare module "virtual:stylex:runtime";

declare module "virtual:lenso-preview" {
  export const isUiPreview: boolean;
  export const previewMounts: readonly import("./preview-shell").PreviewMount[];
  export function selectPreviewMounts(mounts: readonly unknown[]): unknown[];
  export function exampleServices(
    signal: AbortSignal
  ): import("../src/index").WorkspaceServices;
}

declare module "virtual:lenso-preview-page" {
  const Page: import("react").ComponentType<import("../src/index").PageProps>;
  export default Page;
}
