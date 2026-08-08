import { Button, StateView, controlStyles } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, House, LoaderCircle } from "lucide-react";

/**
 * Shared route lifecycle UI. The router owns when these states render; this
 * module owns how they look and how retry/navigation actions behave.
 */
export const RoutePending = () => (
  <StateView
    description="The Console is preparing this surface."
    icon={<LoaderCircle aria-hidden="true" size={18} />}
    title="Loading Console"
  />
);

export const RouteNotFound = () => (
  <StateView
    action={
      <Link
        to="/"
        {...stylex.props(controlStyles.button, controlStyles.buttonPrimary)}
      >
        <House aria-hidden="true" size={14} />
        Back to Home
      </Link>
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
    <StateView
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
