import { Button } from "@lenso/ui/button";
import { Link as LensoLink } from "@lenso/ui/link";
import * as stylex from "@stylexjs/stylex";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, House, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { routeStateStyles as styles } from "./route-states.stylex";

export const RoutePending = () => (
  <RouteState
    description="Preparing workspace content."
    icon={<LoaderCircle aria-hidden="true" size={18} />}
    title="Loading Console"
  />
);

export const RouteNotFound = () => (
  <RouteState
    action={
      <LensoLink render={<Link to="/" />}>
        <House aria-hidden="true" size={14} />
        Back to workspace
      </LensoLink>
    }
    description="This page does not exist or has been removed. Return to the workspace."
    icon={<House aria-hidden="true" size={18} />}
    title="Page not found"
  />
);

export const RouteError = () => {
  const router = useRouter();
  return (
    <RouteState
      action={
        <Button onClick={() => void router.invalidate()} variant="primary">
          Reload
        </Button>
      }
      description="The workspace could not load. Reload to try again. If the problem persists, check the local development logs."
      icon={<AlertTriangle aria-hidden="true" size={18} />}
      title="Unable to load workspace"
    />
  );
};

function RouteState({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <main {...stylex.props(styles.root)}>
      <span {...stylex.props(styles.icon)}>{icon}</span>
      <h1 {...stylex.props(styles.title)}>{title}</h1>
      <p {...stylex.props(styles.description)}>{description}</p>
      {action}
    </main>
  );
}
