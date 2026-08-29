import { Button } from "@lenso/ui/button";
import { Surface } from "@lenso/ui/surface";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, House, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./route-states.module.css";

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
    <main className={styles.page}>
      <Surface className={styles.card} level="panel">
        <div className={styles.icon}>{icon}</div>
        <h1>{title}</h1>
        <p>{description}</p>
        {action ? <div className={styles.action}>{action}</div> : null}
      </Surface>
    </main>
  );
}

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
      <Button render={<Link to="/" />} variant="primary">
        <House aria-hidden="true" size={14} /> Back to Home
      </Button>
    }
    description="The requested Console location does not exist."
    icon={<House aria-hidden="true" size={18} />}
    title="Page not found"
  />
);

export const RouteError = ({ error }: { error: Error }) => {
  const router = useRouter();
  const message = error.message || "The route could not be rendered.";

  return (
    <RouteState
      action={
        <Button
          onClick={() => {
            void router.invalidate();
          }}
          variant="primary"
        >
          Try again
        </Button>
      }
      description={message}
      icon={<AlertTriangle aria-hidden="true" size={18} />}
      title="Console route failed"
    />
  );
};
