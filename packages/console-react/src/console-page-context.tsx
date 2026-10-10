import {
  createContext,
  useCallback,
  useContext,
  useInsertionEffect,
  useMemo,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export interface ConsolePageContextHandle<T> {
  context: Readonly<T>;
  /** Last committed snapshot, never a speculative render; throws after scope closure. */
  getContext: () => Readonly<T>;
  setContext: Dispatch<SetStateAction<T>>;
}

export interface ConsolePageContextProviderProps<T> {
  /** UI activation token, not a cached page identity or layout preference. */
  scopeKey: string;
  value: T;
  onChange: Dispatch<SetStateAction<T>>;
  children: ReactNode;
}

/**
 * Create once at module scope. Keep controlled state outside the keyed Provider.
 * Change scopeKey when page context activates, not when layout/presentation changes.
 * Only scope-dependent UI belongs inside; persistent page panes can remain outside.
 */
export function createConsolePageContext<T>() {
  const Context = createContext<ConsolePageContextHandle<T> | undefined>(
    undefined
  );

  function ScopeProvider({
    value,
    onChange,
    children,
  }: Omit<ConsolePageContextProviderProps<T>, "scopeKey">) {
    const committed = useRef({ value, onChange });
    const live = useRef(false);

    // Publish during commit, before descendant layout effects use these handles.
    // Only refs change here; no layout reads or state updates occur in this effect.
    useInsertionEffect(() => {
      committed.current = { value, onChange };
      live.current = true;
      return () => {
        live.current = false;
      };
    }, [value, onChange]);

    const getContext = useCallback((): Readonly<T> => {
      if (!live.current) {
        throw new Error(
          "This console page context activation scope is closed."
        );
      }
      return committed.current.value;
    }, []);
    const setContext = useCallback<Dispatch<SetStateAction<T>>>((update) => {
      // A retained handle cannot dispatch into a later activation of the same page.
      if (live.current) {
        committed.current.onChange(update);
      }
    }, []);

    const handle = useMemo(
      () => ({ context: value as Readonly<T>, getContext, setContext }),
      [value, getContext, setContext]
    );

    return <Context.Provider value={handle}>{children}</Context.Provider>;
  }

  // This component must close over this factory call's Context identity.
  // eslint-disable-next-line unicorn/consistent-function-scoping
  function Provider({
    scopeKey,
    ...props
  }: ConsolePageContextProviderProps<T>) {
    return <ScopeProvider key={scopeKey} {...props} />;
  }

  function useConsolePageContext(): ConsolePageContextHandle<T> {
    const handle = useContext(Context);
    if (handle === undefined) {
      throw new Error(
        "useConsolePageContext requires its console page context Provider."
      );
    }
    return handle;
  }

  return { Provider, useConsolePageContext };
}
