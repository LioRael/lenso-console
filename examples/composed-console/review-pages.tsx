import type { AdministrationClient } from "@lenso/auth-console/client";
import type { OAuthConsoleClient } from "@lenso/auth-console/oauth/client";
import {
  bindConsole,
  ConsoleLayout,
  ConsoleLogin,
  defineConsolePlugin,
  type ConsoleLocalPageProps,
  type ConsoleLoginProps,
} from "@lenso/console-react";
import type { WorkspaceServices } from "@lenso/console-sdk";
import { Link } from "@lenso/ui/link";
import * as stylex from "@stylexjs/stylex";
import {
  BookOpen,
  Bot,
  Fingerprint,
  KeyRound,
  Network,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { lazyPage } from "./lazy-page";
import { ReviewDirectory, reviewAuthStates } from "./review-directory";

export interface ReviewServices {
  administration: AdministrationClient;
  oauth: OAuthConsoleClient;
  workspace: WorkspaceServices;
  navigate(href: string): void;
}

type Props = ConsoleLocalPageProps<ReviewServices>;

const Identity = lazyPage<Props>(async () => {
  const pages = await import("./review-administration");
  return { default: pages.Identity };
});
const User = lazyPage<Props>(async () => {
  const pages = await import("./review-administration");
  return { default: pages.User };
});
const Access = lazyPage<Props>(async () => {
  const pages = await import("./review-administration");
  return { default: pages.Access };
});
const Roles = lazyPage<Props>(async () => {
  const pages = await import("./review-administration");
  return { default: pages.Roles };
});
const Agent = lazyPage<Props>(async () => {
  const pages = await import("./review-administration");
  return { default: pages.Agent };
});
const Events = lazyPage<Props>(async () => {
  const pages = await import("./review-administration");
  return { default: pages.Events };
});
const Authorization = lazyPage<Props>(async () => {
  const pages = await import("./review-inspection");
  return { default: pages.Authorization };
});
const Runtime = lazyPage<Props>(async () => {
  const pages = await import("./review-inspection");
  return { default: pages.Runtime };
});
const Applications = lazyPage<Props>(async () => {
  const pages = await import("./review-oauth");
  return { default: pages.Applications };
});
const Consent = lazyPage<Props>(async () => {
  const pages = await import("./review-oauth");
  return { default: pages.Consent };
});

export function bindReviewPages(services: ReviewServices) {
  return bindConsole(
    defineConsolePlugin<ReviewServices>({
      id: "ui-review",
      pages: {
        directory: { title: "All pages", component: ReviewDirectory },
        identity: { title: "Identity", component: Identity },
        user: { title: "User", component: User },
        access: { title: "Access", component: Access },
        roles: { title: "Roles", component: Roles },
        agent: { title: "Agent connections", component: Agent },
        events: { title: "Management events", component: Events },
        authorization: { title: "Authorization", component: Authorization },
        runtime: { title: "Runtime", component: Runtime },
        applications: {
          title: "Connected applications",
          component: Applications,
        },
        consent: { title: "Application consent", component: Consent },
      },
      pageGroups: {
        access: {
          label: "Console access",
          defaultPage: "access",
          tabs: [
            { page: "access", label: "Members" },
            { page: "roles", label: "Roles" },
          ],
        },
        agent: {
          label: "Agent connections",
          defaultPage: "agent",
          tabs: [
            { page: "agent", label: "Tokens" },
            { page: "events", label: "Events" },
          ],
        },
      },
      navigation: [
        {
          id: "review",
          page: "directory",
          label: "All pages · sample preview",
          icon: <BookOpen size={20} aria-hidden="true" />,
        },
        {
          id: "identity",
          page: "identity",
          label: "Identity",
          icon: <UsersRound size={20} aria-hidden="true" />,
        },
        {
          id: "access",
          page: "access",
          label: "Access",
          icon: <ShieldCheck size={20} aria-hidden="true" />,
        },
        {
          id: "agent",
          page: "agent",
          label: "Agent connections",
          icon: <Bot size={20} aria-hidden="true" />,
        },
        {
          id: "authorization",
          page: "authorization",
          label: "Authorization",
          icon: <KeyRound size={20} aria-hidden="true" />,
        },
        {
          id: "runtime",
          page: "runtime",
          label: "Runtime",
          icon: <Network size={20} aria-hidden="true" />,
        },
        {
          id: "applications",
          page: "applications",
          label: "Connected applications",
          icon: <Fingerprint size={20} aria-hidden="true" />,
        },
      ],
    }),
    {
      id: "ui-review",
      services,
      routes: {
        directory: "/review",
        identity: "/identity",
        user: "/identity/users/:subjectId",
        access: "/access",
        roles: "/access/roles",
        agent: "/agent-connections",
        events: "/agent-connections/events",
        authorization: "/authorization",
        runtime: "/runtime",
        applications: "/connected-applications",
        consent: "/oauth/consent/:requestId",
      },
    }
  );
}

export function ReviewNotice({ standalone = false }: { standalone?: boolean }) {
  const notice = (
    <Link href="/review" xstyle={styles.notice}>
      {standalone
        ? "Sample login · no real credentials · all pages"
        : "Sample preview · all pages"}
    </Link>
  );
  return standalone ? (
    notice
  ) : (
    <ConsoleLayout.Foreground>{notice}</ConsoleLayout.Foreground>
  );
}

export function ReviewLogin({
  state,
  navigate,
}: {
  state: string;
  navigate(href: string): void;
}) {
  const selected =
    reviewAuthStates.some(([id]) => id === state) && state !== "error"
      ? (state as ConsoleLoginProps["state"])
      : "unauthenticated";
  return (
    <>
      <ReviewNotice standalone />
      <ConsoleLogin
        state={selected}
        methods={[
          {
            id: "sample-password",
            kind: "password",
            label: "Sample only. Use disposable text, never real credentials.",
          },
        ]}
        error={
          state === "error"
            ? new Error(
                "Sample login failure. No authentication request was sent."
              )
            : undefined
        }
        onPassword={() => navigate("/review")}
        onRedirect={() => navigate("/review")}
        onRetry={() => navigate("/review/auth/unauthenticated")}
        onCancel={() => navigate("/review")}
        onLogout={() => navigate("/review/auth/unauthenticated")}
      />
    </>
  );
}

const styles = stylex.create({
  notice: {
    position: "fixed",
    top: 54,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 12,
    lineHeight: "18px",
    whiteSpace: "nowrap",
    color: "color-mix(in oklab, var(--muted) 90%, var(--foreground) 10%)",
    zIndex: 1,
  },
});
