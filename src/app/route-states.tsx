import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, House, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { routeStateStyles as styles } from "./route-states.stylex";

export const RoutePending = () => (
  <RouteState
    description="The Console is preparing this page."
    icon={<LoaderCircle aria-hidden="true" size={18} />}
    title="Loading Console"
  />
);

export const RouteNotFound = () => (
  <RouteState
    action={
      <Button nativeButton={false} render={<Link to="/" />} variant="primary">
        <House aria-hidden="true" size={14} />
        Back to Agent
      </Button>
    }
    description="The requested Console location does not exist."
    icon={<House aria-hidden="true" size={18} />}
    title="Page not found"
  />
);

export const RouteError = ({ error }: { error: Error }) => {
  const router = useRouter();
  return (
    <RouteState
      action={
        <Button onClick={() => void router.invalidate()} variant="primary">
          Try again
        </Button>
      }
      description={error.message || "The page could not be rendered."}
      icon={<AlertTriangle aria-hidden="true" size={18} />}
      title="Console page failed"
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
