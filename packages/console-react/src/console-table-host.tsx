import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  chooseTableContext,
  type ConsoleTableControls,
  type ConsoleTableGroupKind,
  type ConsoleTablePlacement,
  type ConsoleTablePlacements,
  type TableCandidate,
} from "./console-table-model";

type Registration = {
  id: string;
  label: string;
  mode: TableCandidate["mode"];
  element: HTMLElement;
  locked: () => boolean;
};

type Host = {
  active: string | null;
  entries: readonly Registration[];
  explicit: string | null;
  placements: ConsoleTablePlacements;
  canPlace: boolean;
  customization: boolean;
  register: (entry: Registration) => () => void;
  choose: (id: string | null) => void;
  place: (kind: ConsoleTableGroupKind, area: ConsoleTablePlacement) => void;
};

const Context = createContext<Host | null>(null);

export function useConsoleTableHost() {
  const host = useContext(Context);
  if (!host) {
    throw new Error("ConsoleTableContext requires ConsoleLayout.");
  }
  return host;
}

function viewportCoverage(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  let top = Math.max(0, rect.top);
  let bottom = Math.min(innerHeight, rect.bottom);
  let left = Math.max(0, rect.left);
  let right = Math.min(innerWidth, rect.right);
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const clip = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowY)) {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowX)) {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
  }
  return right > left ? Math.max(0, bottom - top) / innerHeight : 0;
}

export function ConsoleTableHost({
  children,
  controls,
}: {
  children: ReactNode;
  controls?: ConsoleTableControls;
}) {
  const [entries, setEntries] = useState<readonly Registration[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [explicit, setExplicit] = useState<string | null>(null);
  const [localPlacements, setLocalPlacements] =
    useState<ConsoleTablePlacements>({});
  const activeRef = useRef<string | null>(null);
  const register = useCallback((entry: Registration) => {
    setEntries((current) => [
      ...current.filter((item) => item.id !== entry.id),
      entry,
    ]);
    return () =>
      setEntries((current) => current.filter((item) => item !== entry));
  }, []);
  const choose = useCallback((id: string | null) => {
    setExplicit(id);
  }, []);
  const placements = controls?.placements ?? localPlacements;
  const customization = controls?.customization === true;
  const canPlace =
    controls?.placements === undefined || !!controls.onPlacementsChange;
  const place = useCallback(
    (kind: ConsoleTableGroupKind, area: ConsoleTablePlacement) => {
      const next = { ...placements, [kind]: area };
      if (controls?.placements === undefined) {
        setLocalPlacements(next);
      }
      controls?.onPlacementsChange?.(next);
    },
    [placements, controls]
  );
  const enter = Math.min(1, Math.max(0.1, controls?.enterCoverage ?? 0.55));
  const exit = Math.min(enter, Math.max(0, controls?.exitCoverage ?? 0.35));
  const dwell = Math.max(0, controls?.dwellMs ?? 180);

  useEffect(() => {
    if (entries.length === 0) {
      activeRef.current = null;
      setActive(null);
      return;
    }
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: string | null | undefined;
    let since = 0;
    let pointerDown = false;
    const evaluate = () => {
      frame = 0;
      const focused = document.activeElement;
      const owner =
        focused instanceof HTMLElement
          ? focused.closest<HTMLElement>("[data-console-table-owner]")?.dataset
              .consoleTableOwner
          : undefined;
      const editingElsewhere =
        focused instanceof HTMLElement &&
        focused !== document.body &&
        focused.matches("input, textarea, select, [contenteditable=true]");
      const fallback =
        entries.find((entry) => entry.mode === "page")?.id ?? null;
      const overlay = document.querySelector(
        '[role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden]), [role="menu"]:not([hidden]), [role="listbox"]:not([hidden]), [data-console-filter-editing]'
      );
      const next = chooseTableContext(
        entries.map((entry) => ({
          id: entry.id,
          mode: entry.mode,
          coverage: viewportCoverage(entry.element),
          locked: entry.locked(),
        })),
        activeRef.current,
        {
          blocked: pointerDown || !!overlay,
          focused: owner ?? (editingElsewhere ? fallback : null),
          pageFocused: editingElsewhere && !owner,
          explicit,
          enter,
          exit,
        }
      );
      clearTimeout(timer);
      const immediate =
        !!owner ||
        editingElsewhere ||
        explicit !== null ||
        (!entries.some((entry) => entry.id === activeRef.current) &&
          entries.find((entry) => entry.id === next)?.mode !== "embedded");
      if (next !== pending) {
        pending = next;
        since = performance.now();
      }
      if (immediate || performance.now() - since >= dwell) {
        activeRef.current = next;
        setActive(next);
      } else {
        timer = setTimeout(schedule, dwell - (performance.now() - since));
      }
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(evaluate);
      }
    };
    const press = () => {
      pointerDown = true;
    };
    const release = () => {
      pointerDown = false;
      schedule();
    };
    const observer = new ResizeObserver(schedule);
    entries.forEach((entry) => observer.observe(entry.element));
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    schedule();
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
    };
  }, [entries, explicit, enter, exit, dwell]);

  useEffect(() => {
    if (explicit && !entries.some((entry) => entry.id === explicit)) {
      setExplicit(null);
    }
  }, [entries, explicit]);

  const value = useMemo(
    () => ({
      active,
      entries,
      explicit,
      placements,
      canPlace,
      customization,
      register,
      choose,
      place,
    }),
    [
      active,
      entries,
      explicit,
      placements,
      canPlace,
      customization,
      register,
      choose,
      place,
    ]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
