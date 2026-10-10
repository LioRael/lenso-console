import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from "react";

export type DockProjection = {
  element: HTMLDivElement;
  token: object;
  expanded: boolean;
  instant: boolean;
  onReady: () => void;
};

type ProjectionContext = {
  target: HTMLDivElement | null;
  setTarget: Dispatch<SetStateAction<HTMLDivElement | null>>;
  active: DockProjection | null;
  setActive: Dispatch<SetStateAction<DockProjection | null>>;
  instant: boolean;
  setInstant: Dispatch<SetStateAction<boolean>>;
};

const Context = createContext<ProjectionContext | null>(null);

/** One stable portal destination inside the physical Dock, not a second surface. */
export function ConsoleDockProjectionProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState<DockProjection | null>(null);
  const [instant, setInstant] = useState(false);
  const value = useMemo(
    () => ({ target, setTarget, active, setActive, instant, setInstant }),
    [target, active, instant]
  );
  return <Context value={value}>{children}</Context>;
}

export function useDockProjection() {
  return useContext(Context);
}
