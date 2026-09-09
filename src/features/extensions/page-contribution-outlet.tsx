import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import {
  Component,
  createElement,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { RoutePending } from "../../app/route-states";
import { usePageCatalog, type PageMount } from "./page-contribution-catalog";

type ContributionProps = {
  location: { hash: string; search: string; segments: readonly string[] };
  mount: PageMount;
};

type ContributionModule = {
  apiMajor: 1;
  createPage(runtime: { createElement: typeof createElement }): {
    Page: ComponentType<ContributionProps>;
  };
};

const styles = stylex.create({
  error: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "64px 24px",
  },
  heading: {
    fontSize: "20px",
    margin: 0,
  },
  message: {
    color: "var(--lenso-color-text-secondary)",
    lineHeight: 1.5,
    margin: 0,
  },
});

export function PageContributionOutlet({
  mountId,
  segments,
}: {
  mountId: string;
  segments: readonly string[];
}) {
  const t = useConsoleTranslation();
  const catalog = usePageCatalog();
  const mount = catalog.data?.find((candidate) => candidate.id === mountId);
  const [attempt, setAttempt] = useState(0);
  const loaded = useContributionModule(mount, attempt);
  const location = useMemo(
    () => ({
      hash: window.location.hash,
      search: window.location.search,
      segments,
    }),
    [segments]
  );

  if (catalog.isPending || (mount && loaded.status === "loading")) {
    return <RoutePending />;
  }
  if (catalog.error) {
    return (
      <ContributionError
        message={catalog.error.message}
        onRetry={() => void catalog.refetch()}
        title={t("Extension catalog unavailable")}
      />
    );
  }
  if (!mount) {
    return (
      <ContributionError
        message={t("This page contribution is not installed or enabled.")}
        title={t("Extension unavailable")}
      />
    );
  }
  if (loaded.status === "error") {
    return (
      <ContributionError
        message={loaded.error.message}
        onRetry={() => setAttempt((value) => value + 1)}
        title={t("Extension failed to load")}
      />
    );
  }
  if (loaded.status !== "ready") {
    return <RoutePending />;
  }
  return (
    <ContributionRenderBoundary
      key={`${mount.id}:${attempt}`}
      onRetry={() => setAttempt((value) => value + 1)}
      title={t("Extension failed to render")}
    >
      <loaded.Page location={location} mount={mount} />
    </ContributionRenderBoundary>
  );
}

type ContributionRenderBoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
  title: string;
};

class ContributionRenderBoundary extends Component<
  ContributionRenderBoundaryProps,
  { error?: Error }
> {
  constructor(props: ContributionRenderBoundaryProps) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  render() {
    return this.state.error ? (
      <ContributionError
        message={this.state.error.message}
        onRetry={this.props.onRetry}
        title={this.props.title}
      />
    ) : (
      this.props.children
    );
  }
}

function useContributionModule(mount: PageMount | undefined, attempt: number) {
  const [state, setState] = useState<
    | { status: "idle" | "loading" }
    | { status: "ready"; Page: ComponentType<ContributionProps> }
    | { status: "error"; error: Error }
  >({ status: "idle" });

  useEffect(() => {
    if (!mount) {
      setState({ status: "idle" });
      return;
    }
    let current = true;
    const stylesReady = mount.styles.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.consoleContribution = mount.id;
      const ready = new Promise<void>((resolve, reject) => {
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener(
          "error",
          () => reject(new Error(`Extension style failed to load: ${href}`)),
          { once: true }
        );
      });
      document.head.append(link);
      return { link, ready };
    });
    setState({ status: "loading" });
    const load = async () => {
      try {
        await Promise.all(stylesReady.map(({ ready }) => ready));
        // eslint-disable-next-line no-inline-comments -- Vite requires this import annotation.
        const value: unknown = await import(/* @vite-ignore */ mount.module);
        if (!current) {
          return;
        }
        if (!isContributionModule(value)) {
          throw new TypeError("The extension module contract is invalid");
        }
        const page = value.createPage({ createElement });
        if (!page || typeof page.Page !== "function") {
          throw new TypeError("The extension page export is invalid");
        }
        setState({ Page: page.Page, status: "ready" });
      } catch (error) {
        if (current) {
          setState({
            error: error instanceof Error ? error : new Error(String(error)),
            status: "error",
          });
        }
      }
    };
    void load();
    return () => {
      current = false;
      for (const { link } of stylesReady) {
        link.remove();
      }
    };
  }, [attempt, mount]);
  return state;
}

function isContributionModule(value: unknown): value is ContributionModule {
  return (
    !!value &&
    typeof value === "object" &&
    "apiMajor" in value &&
    value.apiMajor === 1 &&
    "createPage" in value &&
    typeof value.createPage === "function"
  );
}

function ContributionError({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry?: () => void;
  title: string;
}) {
  const t = useConsoleTranslation();
  return (
    <section {...stylex.props(styles.error)}>
      <h1 {...stylex.props(styles.heading)}>{title}</h1>
      <p {...stylex.props(styles.message)}>{message}</p>
      {onRetry ? <Button onClick={onRetry}>{t("Try again")}</Button> : null}
    </section>
  );
}
