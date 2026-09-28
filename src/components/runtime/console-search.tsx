import { CommandMenu } from "@lenso/ui/command-menu";
import { Dialog } from "@lenso/ui/dialog";
import * as stylex from "@stylexjs/stylex";
import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { searchStyles as styles } from "./console-search.stylex";

export type ConsoleSearchItem = {
  id: string;
  group: string;
  label: string;
  onSelect: () => void;
};

export function ConsoleSearch({
  items,
}: {
  items: readonly ConsoleSearchItem[];
}) {
  const t = useConsoleTranslation();
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
  const matches = items.filter((item) =>
    `${item.group} ${item.label}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  return (
    <>
      <button
        aria-label={t("Search Console")}
        onClick={openSearch}
        ref={triggerRef}
        type="button"
        {...stylex.props(styles.trigger)}
      >
        <Search aria-hidden="true" size={16} />
        <span {...stylex.props(styles.triggerLabel)}>
          {t("Search Console…")}
        </span>
        <kbd {...stylex.props(styles.shortcut)}>⌘ K</kbd>
      </button>
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
              <CommandMenu.Root<ConsoleSearchItem>
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
                <CommandMenu.Panel xstyle={styles.commandPanel}>
                  <Dialog.Title xstyle={styles.visuallyHiddenTitle}>
                    {t("Search Console")}
                  </Dialog.Title>
                  <CommandMenu.Search xstyle={styles.searchField}>
                    <Search aria-hidden="true" size={17} />
                    <CommandMenu.Input
                      aria-label={t("Search Console")}
                      placeholder={t("Search workspaces and pages…")}
                      ref={inputRef}
                      xstyle={styles.searchInput}
                    />
                  </CommandMenu.Search>
                  <CommandMenu.List xstyle={styles.results}>
                    {(item: ConsoleSearchItem) => (
                      <CommandMenu.Item
                        key={item.id}
                        value={item}
                        xstyle={styles.result}
                      >
                        <CommandMenu.ItemText>
                          {item.label}
                        </CommandMenu.ItemText>
                        <span {...stylex.props(styles.group)}>
                          {item.group}
                        </span>
                      </CommandMenu.Item>
                    )}
                  </CommandMenu.List>
                  <CommandMenu.Empty>
                    {t("No matching destinations.")}
                  </CommandMenu.Empty>
                </CommandMenu.Panel>
              </CommandMenu.Root>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
