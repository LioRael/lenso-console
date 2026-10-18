import type { ConsoleWorkspaceSetting } from "./settings";

/** Local workspace declaration. App composition may override its mount path. */
export interface WorkspaceDeclaration {
  id?: string;
  title?: string;
  path?: string;
  /** Relative homepage. Omitted uses the root page.tsx. */
  index?: readonly string[];
  /** Uses Console's existing session and workspace admission policy. */
  access?: "member" | "administrator";
  /** Service aliases admitted to this workspace when a Plugin owns several. */
  services?: readonly string[];
  /** Navigation only; configuration UI and mutations remain Plugin-owned. */
  settings?: readonly ConsoleWorkspaceSetting[];
}

export function defineWorkspace<const T extends WorkspaceDeclaration>(
  value: T
): T {
  return value;
}
