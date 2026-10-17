import { ConsoleLogin, type ConsoleLoginProps } from "@lenso/console-react";
import type { ConsoleLoginMethod } from "@lenso/console-sdk/authentication";
import { useConsoleAdmission } from "@lenso/console-sdk/browser";
import type { ReactNode } from "react";

/** An application-owned alternative to the shipped Shell's route provider. */
export function ApplicationConsoleGate({
  children,
  login,
}: {
  children: (session: ReturnType<typeof useConsoleAdmission>) => ReactNode;
  login?: Pick<
    ConsoleLoginProps<ConsoleLoginMethod>,
    "renderers" | "renderPage"
  > & {
    allowedReturnRoots?: readonly string[];
  };
}) {
  const session = useConsoleAdmission();
  if (session.state === "authenticated" && session.admission) {
    return (
      <div key={`${session.admission.subject}:${session.admission.readScope}`}>
        {children(session)}
      </div>
    );
  }
  return (
    <ConsoleLogin
      {...login}
      state={session.state}
      methods={session.discovery?.methods ?? []}
      error={session.actionError}
      busy={session.busy}
      onPassword={(method, input) => void session.login(method, input)}
      onCustom={(method, input) => void session.login(method, input)}
      onRedirect={(method) =>
        session.redirect(method, undefined, login?.allowedReturnRoots)
      }
      onRetry={() => session.retry()}
      onCancel={() => session.cancel()}
      onLogout={
        session.discovery?.session?.logout
          ? () => void session.logout()
          : undefined
      }
    />
  );
}
