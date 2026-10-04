import { createContext, createElement, useContext } from "react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

import type { PageProps } from "./index";

const WorkspaceContext = createContext<PageProps | undefined>(undefined);

/** Installed by the existing compiled page factory, once per instance mount. */
export function WorkspaceScope({
  value,
  children,
}: {
  value: PageProps;
  children?: ReactNode;
}) {
  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspace(): PageProps {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error("Workspace navigation requires a mounted Console page");
  }
  return workspace;
}

/** Relative navigation through the current instance, with normal anchor behavior. */
export function Link({
  to,
  onClick,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: readonly string[];
}) {
  const { navigation } = useWorkspace();
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (props.download !== undefined && props.download !== false) ||
      (props.target && props.target !== "_self")
    ) {
      return;
    }
    event.preventDefault();
    navigation.go(to);
  };
  return createElement("a", {
    ...props,
    href: navigation.href(to),
    onClick: click,
  });
}
