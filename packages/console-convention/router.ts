import * as React from "react";

import type {
  ErrorProps,
  LayoutProps,
  PageProps,
} from "../console-sdk/src/index";

type Layer = {
  Layout?: React.ComponentType<LayoutProps>;
  Loading?: React.ComponentType;
  Error?: React.ComponentType<ErrorProps>;
};
export interface Route {
  segments: string[];
  Page: React.ComponentType<PageProps>;
  layers: Layer[];
}
class Boundary extends React.Component<
  {
    children?: React.ReactNode;
    fallback: React.ComponentType<ErrorProps>;
  },
  { error: Error | null }
> {
  constructor(props: {
    children?: React.ReactNode;
    fallback: React.ComponentType<ErrorProps>;
  }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error
      ? React.createElement(this.props.fallback, {
          error: this.state.error,
          reset: () => this.setState({ error: null }),
        })
      : this.props.children;
  }
}
export function match(segments: string[], actual: readonly string[]) {
  const params: Record<string, string | readonly string[]> = {};
  let cursor = 0;
  for (const segment of segments) {
    if (segment.startsWith("[[...")) {
      params[segment.slice(5, -2)] = actual.slice(cursor);
      cursor = actual.length;
    } else if (segment.startsWith("[...")) {
      if (cursor === actual.length) {
        return null;
      }
      params[segment.slice(4, -1)] = actual.slice(cursor);
      cursor = actual.length;
    } else {
      const value = actual[cursor];
      if (value === undefined) {
        return null;
      }
      if (segment.startsWith("[")) {
        params[segment.slice(1, -1)] = value;
      } else if (segment !== actual[cursor]) {
        return null;
      }
      cursor += 1;
    }
  }
  return cursor === actual.length ? params : null;
}
export function createPageRouter(
  routes: Route[],
  NotFound?: React.ComponentType<PageProps>
) {
  return function Page(props: PageProps) {
    for (const route of routes) {
      const params = match(route.segments, props.location.segments);
      if (params === null) {
        continue;
      }
      const scoped = { ...props, params };
      let child: React.ReactNode = React.createElement(route.Page, scoped);
      for (const layer of route.layers.toReversed()) {
        if (layer.Loading) {
          child = React.createElement(
            React.Suspense,
            { fallback: React.createElement(layer.Loading) },
            child
          );
        }
        if (layer.Error) {
          child = React.createElement(
            Boundary,
            { key: props.location.segments.join("/"), fallback: layer.Error },
            child
          );
        }
        if (layer.Layout) {
          child = React.createElement(layer.Layout, scoped, child);
        }
      }
      return child;
    }
    return NotFound
      ? React.createElement(NotFound, props)
      : React.createElement("p", { role: "status" }, "Page not found");
  };
}
