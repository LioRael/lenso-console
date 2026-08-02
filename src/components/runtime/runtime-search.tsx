import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useRuntimeConsole } from "./runtime-console-context";

export function RuntimeSearch() {
  const { searchInputRef, searchRuntime, selectSearchResult } =
    useRuntimeConsole();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => searchRuntime(query), [query, searchRuntime]);

  return (
    <div className="relative">
      <label className="flex h-7 items-center gap-2 rounded-[var(--radius-control)] border border-(--line) bg-(--bg-control) px-2 text-(--fg-tertiary) shadow-(--elevation-control) transition-colors focus-within:border-(--accent) focus-within:bg-(--bg-control-hover)">
        <Search size={13} />
        <input
          ref={searchInputRef}
          aria-label="Search runtime"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-full bg-transparent text-xs text-(--fg-primary) outline-hidden placeholder:text-(--fg-quaternary) focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:outline-offset-1"
          placeholder="story / node / correlation / outbox / function"
          value={query}
        />
        <span className="rounded border border-(--line) px-1 py-0.5 text-[11px] leading-none text-(--fg-tertiary)">
          /
        </span>
      </label>
      {open && query.trim() ? (
        <div className="absolute left-0 top-9 z-30 w-[min(620px,calc(100vw-64px))] overflow-hidden rounded-[var(--radius-popover)] border border-(--line) bg-(--bg-overlay) shadow-(--elevation-overlay)">
          {results.length === 0 ? (
            <div className="p-3 text-xs text-(--fg-tertiary)">
              No runtime objects found
            </div>
          ) : (
            results.map((result) => (
              <button
                className="grid w-full grid-cols-[86px_minmax(0,1fr)] gap-3 border-b border-(--line) bg-transparent px-2.5 py-2 text-left text-(--fg-primary) last:border-b-0 hover:bg-(--bg-row-hover)"
                key={`${result.kind}:${result.id}`}
                onClick={() => {
                  selectSearchResult(result);
                  setOpen(false);
                  setQuery("");
                }}
                type="button"
              >
                <span className="self-center text-[11px] font-bold uppercase tracking-[0.04em] text-(--fg-tertiary)">
                  {searchResultKindLabel(result.kind)}
                </span>
                <span>
                  <strong className="block truncate text-xs font-semibold">
                    {result.title}
                  </strong>
                  <small className="mt-0.5 block truncate text-[11px] text-(--fg-tertiary)">
                    {result.subtitle}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function searchResultKindLabel(kind: string) {
  if (kind === "event") {
    return "outbox";
  }
  return kind;
}
