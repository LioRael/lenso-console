import {
  createContext,
  useContext,
  useId,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ConsoleDockSelection } from "./console-dock";

type Contribution = { owner: object; value: ConsoleDockSelection };
const ActionHost = createContext<{
  publish(contribution: Contribution): () => void;
} | null>(null);

export function ConsoleActionHost({
  children,
  render,
}: {
  children: ReactNode;
  render(selection: ConsoleDockSelection | null): ReactNode;
}) {
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const host = useMemo(
    () => ({
      publish(next: Contribution) {
        setContribution(next);
        return () =>
          setContribution((current) =>
            current?.owner === next.owner ? null : current
          );
      },
    }),
    []
  );
  return (
    <ActionHost.Provider value={host}>
      {children}
      {render(contribution?.value ?? null)}
    </ActionHost.Provider>
  );
}

export interface ConsoleActionScopeProps {
  scopeKey: string;
  value: ConsoleDockSelection | null;
  children?: ReactNode;
}

/** Controlled presentation only. The page owns targets, confirmation and execution. */
export function ConsoleActionScope({
  scopeKey,
  value,
  children,
}: ConsoleActionScopeProps) {
  const host = useContext(ActionHost);
  if (!host) {
    throw new Error("ConsoleActionScope requires ConsoleShell.");
  }
  const ownerId = useId();
  const lease = useMemo(() => ({ live: false, scopeKey }), [scopeKey]);
  const committed = useRef(value);
  useInsertionEffect(() => {
    committed.current = value;
    lease.live = true;
    return () => {
      lease.live = false;
    };
  }, [lease, value]);
  useLayoutEffect(() => {
    if (!value) {
      return;
    }
    const selection: ConsoleDockSelection = {
      ...value,
      activationKey: JSON.stringify([ownerId, lease.scopeKey]),
      actions: value.actions.map((action) => ({
        ...action,
        onInvoke: () => {
          if (lease.live && !committed.current?.running) {
            committed.current?.actions
              .find((item) => item.id === action.id)
              ?.onInvoke();
          }
        },
      })),
      onExit: () => {
        if (lease.live && !committed.current?.running) {
          committed.current?.onExit();
        }
      },
    };
    return host.publish({ owner: lease, value: selection });
  }, [host, lease, value, ownerId, scopeKey]);
  return children;
}
