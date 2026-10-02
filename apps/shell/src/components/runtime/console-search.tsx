import { Autocomplete } from "@lenso/ui/autocomplete";
import { Button } from "@lenso/ui/button";
import { Modal as Dialog } from "@lenso/ui/modal";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { searchStyles as styles } from "./console-search.stylex";

export type ConsoleSearchItem = {
  id: string;
  group: string;
  label: string;
  onSelect: () => void;
};

export type ConsoleSearchHandle = { open: () => void };

function subscribeToCompactToolbar(onChange: () => void) {
  const viewport = window.matchMedia("(max-width: 1050px)");
  viewport.addEventListener("change", onChange);
  return () => viewport.removeEventListener("change", onChange);
}

function isToolbarCompact() {
  return window.matchMedia("(max-width: 1050px)").matches;
}

function serverToolbarCompact() {
  return false;
}

export function ConsoleSearch({
  items,
  ref,
  label,
}: {
  items: readonly ConsoleSearchItem[];
  ref?: Ref<ConsoleSearchHandle>;
  label?: string;
}) {
  const t = useConsoleTranslation();
  const compact = useSyncExternalStore(
    subscribeToCompactToolbar,
    isToolbarCompact,
    serverToolbarCompact
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const openSearch = useCallback(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOpen(true);
  }, []);
  const closeSearch = () => {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => {
      const previous = previousFocusRef.current;
      (previous?.isConnected && previous !== document.body
        ? previous
        : triggerRef.current
      )?.focus();
    });
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);
  useImperativeHandle(ref, () => ({ open: openSearch }), [openSearch]);
  const matches = items.filter((item) =>
    `${item.group} ${item.label}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  return (
    <>
      <Button
        isIconOnly={compact}
        size="sm"
        variant="ghost"
        aria-label={t("Search Console")}
        title={label}
        onClick={openSearch}
        ref={triggerRef}
        type="button"
        xstyle={[styles.trigger, !compact && styles.expandedTrigger]}
      >
        {!label || compact ? <Search aria-hidden="true" size={16} /> : null}
        <span {...stylex.props(styles.triggerLabel)}>
          {label ?? t("Search Console…")}
        </span>
        {label ? (
          <ChevronDown
            aria-hidden="true"
            size={12}
            {...stylex.props(styles.shortcut)}
          />
        ) : (
          <kbd {...stylex.props(styles.shortcut)}>⌘ K</kbd>
        )}
      </Button>
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeSearch();
          }
        }}
      >
        <Dialog.Portal className={stylex.props(styles.portal).className}>
          <Dialog.Backdrop xstyle={styles.backdrop} />
          <Dialog.Viewport xstyle={styles.viewport}>
            <Dialog.Popup xstyle={styles.popup}>
              <Autocomplete.Root<ConsoleSearchItem>
                inline
                open
                autoHighlight
                filter={() => true}
                inputValue={query}
                items={matches}
                onInputValueChange={setQuery}
                onValueChange={(item) => {
                  if (item) {
                    item.onSelect();
                    closeSearch();
                  }
                }}
              >
                <div {...stylex.props(styles.commandPanel)}>
                  <Dialog.Title xstyle={styles.visuallyHiddenTitle}>
                    {t("Search Console")}
                  </Dialog.Title>
                  <Autocomplete.InputGroup xstyle={styles.searchField}>
                    <Search aria-hidden="true" size={17} />
                    <Autocomplete.Input
                      aria-label={t("Search Console")}
                      placeholder={t("Search workspaces and pages…")}
                      ref={inputRef}
                      xstyle={styles.searchInput}
                    />
                  </Autocomplete.InputGroup>
                  <Autocomplete.List xstyle={styles.results}>
                    {(item: ConsoleSearchItem) => (
                      <Autocomplete.Item
                        key={item.id}
                        value={item}
                        xstyle={styles.result}
                      >
                        <span>{item.label}</span>
                        <span {...stylex.props(styles.group)}>
                          {item.group}
                        </span>
                      </Autocomplete.Item>
                    )}
                  </Autocomplete.List>
                  <Autocomplete.Empty>
                    {t("No matching destinations.")}
                  </Autocomplete.Empty>
                </div>
              </Autocomplete.Root>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
