import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";

const Context = createContext<{
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
  occupied: boolean;
  setOccupied: (occupied: boolean) => void;
} | null>(null);

export function WorkspaceSidebarProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [occupied, setOccupied] = useState(false);
  const value = useMemo(
    () => ({ target, setTarget, occupied, setOccupied }),
    [target, occupied]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Host owns placement; contributions retain their own providers and lifecycle. */
export function WorkspaceSidebarSlot({ children }: PropsWithChildren) {
  const context = useContext(Context);
  return (
    <>
      {!context?.occupied && children}
      <div ref={context?.setTarget} style={{ display: "contents" }} />
    </>
  );
}

export function ContributionSidebar({ children }: PropsWithChildren) {
  const context = useContext(Context);
  const target = context?.target;
  const setOccupied = context?.setOccupied;
  useEffect(() => {
    if (!target || !setOccupied) {
      return;
    }
    setOccupied(true);
    return () => setOccupied(false);
  }, [target, setOccupied]);
  return target ? createPortal(children, target) : null;
}
