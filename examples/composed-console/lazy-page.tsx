import { Button } from "@lenso/ui/button";
import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type ReactNode,
} from "react";

class PageLoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section role="alert">
          <p>This page could not be loaded. Reloading resets sample changes.</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload preview
          </Button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function lazyPage<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>
): ComponentType<Props> {
  const Page = lazy(load);
  return function LazyPage(props: Props) {
    return (
      <PageLoadBoundary>
        <Suspense fallback={<output>Loading page…</output>}>
          <Page {...props} />
        </Suspense>
      </PageLoadBoundary>
    );
  };
}
