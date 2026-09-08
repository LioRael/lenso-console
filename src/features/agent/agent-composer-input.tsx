/* Rich autocomplete rows require icons and descriptions that native option elements cannot render. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import * as stylex from "@stylexjs/stylex";
import {
  BookOpen,
  FileText,
  Folder,
  Hash,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type Ref } from "react";

import { useAgentAttachments } from "./agent-attachments";
import { composerInputStyles as s } from "./agent-composer-input.stylex";
import {
  AgentDraftEditor,
  type DraftEditorHandle,
  type DraftTrigger,
} from "./agent-draft-editor";
import type {
  AgentContextCatalog,
  AgentContextReference,
  AgentTerminalCatalog,
} from "./agent-runtime";

export type ComposerAction = {
  id: string;
  label: string;
  description: string;
  group?: string;
  run: () => void;
};
type Entry = ComposerAction & { icon: LucideIcon; group: string };
export function AgentComposerInput({
  draft,
  onChange,
  contextCatalog,
  terminalCatalog,
  references,
  onReferencesChange,
  actions,
  placeholder,
  compact,
  ref,
}: {
  draft: string;
  onChange: (text: string) => void;
  contextCatalog?: AgentContextCatalog | undefined;
  terminalCatalog?: AgentTerminalCatalog | undefined;
  references: AgentContextReference[];
  onReferencesChange: (refs: AgentContextReference[]) => void;
  actions: ComposerAction[];
  placeholder: string;
  compact?: boolean;
  ref?: Ref<DraftEditorHandle>;
}) {
  const rootElement = useRef<HTMLDivElement>(null);
  const editor = useRef<DraftEditorHandle>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const attachments = useAgentAttachments();
  const [trigger, setTrigger] = useState<DraftTrigger>();
  const [index, setIndex] = useState(0);
  const [attachmentError, setAttachmentError] = useState("");
  const menuId = useId();
  const list = useRef<HTMLDivElement>(null);
  const addReference = (reference: AgentContextReference) => {
    if (references.length >= 8) {
      setAttachmentError("Choose up to eight context references.");
      return;
    }
    if (
      !references.some(
        (item) => JSON.stringify(item) === JSON.stringify(reference)
      )
    ) {
      onReferencesChange([...references, reference]);
    }
    editor.current?.choose("");
    setTrigger(undefined);
  };
  const entries: Entry[] =
    trigger?.kind === "/"
      ? [
          ...[
            ...actions,
            ...(actions.some((action) => action.id === "status")
              ? []
              : [
                  {
                    id: "status",
                    label: "Status",
                    description: "Show context usage",
                    run: () =>
                      rootElement.current
                        ?.closest("form")
                        ?.querySelector<HTMLButtonElement>(
                          '[aria-label="Context usage"]'
                        )
                        ?.focus(),
                  },
                ]),
            ...(actions.some((action) => action.id === "model")
              ? []
              : [
                  {
                    id: "model",
                    label: "Model",
                    description: "Choose model, reasoning and speed",
                    run: () =>
                      rootElement.current
                        ?.closest("form")
                        ?.querySelector<HTMLButtonElement>(
                          '[aria-label="Run configuration"]'
                        )
                        ?.click(),
                  },
                ]),
          ].map((action) => ({
            ...action,
            group: action.group ?? "Commands",
            icon: Terminal,
          })),
          ...(contextCatalog?.prompts ?? [])
            .filter((item) => {
              try {
                const schema = JSON.parse(item.argumentsSchemaJson);
                return !schema.required?.length;
              } catch {
                return false;
              }
            })
            .map((item): Entry => ({
              id: `${item.source}/${item.name}`,
              label: item.name,
              description: item.description,
              group: item.source === "skills" ? "Skills" : "MCP prompts",
              icon: BookOpen,
              run: () =>
                addReference({
                  kind: "prompt",
                  source: item.source,
                  name: item.name,
                }),
            })),
          ...(terminalCatalog?.commands ?? []).map((item): Entry => ({
            id: item.path.join(" "),
            label: item.path.join(" "),
            description: item.summary,
            group: "Terminal commands",
            icon: Terminal,
            run: () => {
              editor.current?.choose(`/${item.path.join(" ")} `);
            },
          })),
          ...[
            { id: "table", label: "Table" },
            { id: "heading", label: "Heading" },
            { id: "bullet", label: "Bullet list" },
            { id: "task", label: "Checklist" },
            { id: "code", label: "Code block" },
            { id: "quote", label: "Quote" },
          ].map((item): Entry => ({
            ...item,
            description: "Format this block",
            group: "Formatting",
            icon: Hash,
            run: () => editor.current?.format(item.id),
          })),
        ]
      : trigger?.kind === "@"
        ? [
            {
              id: "files",
              label: "Files and images",
              description: "Attach files from your computer",
              group: "Add context",
              icon: FileText,
              run: () => files.current?.click(),
            },
            {
              id: "folder",
              label: "Folder",
              description: "Attach a bounded text snapshot of a folder",
              group: "Add context",
              icon: Folder,
              run: () => folder.current?.click(),
            },
            ...(contextCatalog?.resources ?? []).map((item): Entry => ({
              id: `${item.source}/${item.uri}`,
              label: item.name,
              description: item.description || item.uri,
              group: "MCP resources",
              icon: FileText,
              run: () =>
                addReference({
                  kind: "resource",
                  source: item.source,
                  uri: item.uri,
                  name: item.name,
                }),
            })),
          ]
        : [];
  const query = trigger?.query.toLocaleLowerCase() ?? "";
  const groupOrder = [
    "Commands",
    "Skills",
    "MCP prompts",
    "Add context",
    "MCP resources",
    "Formatting",
    "Models",
    "Reasoning",
    "Terminal commands",
  ];
  const visible = entries
    .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group))
    .filter((item) =>
      [item.id, item.label, item.description, item.group]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
  const active = Math.min(index, Math.max(0, visible.length - 1));
  const select = (entry: Entry) => {
    if (entry.group !== "Formatting" && entry.group !== "Terminal commands") {
      editor.current?.choose("");
    }
    entry.run();
    setTrigger(undefined);
  };
  useEffect(() => {
    list.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, query]);
  const attachFolder = async (selected: File[]) => {
    try {
      const allowed = selected.filter(
        (file) =>
          !/(^|\/)(\.[^/]+|node_modules|target|dist|build)(\/|$)/u.test(
            file.webkitRelativePath
          ) &&
          /\.(md|txt|json|ya?ml|toml|rs|tsx?|jsx?|py|css|html|csv|sh)$/iu.test(
            file.name
          )
      );
      if (!allowed.length) {
        throw new Error("This folder has no supported text files.");
      }
      let bytes = 0;
      const content: string[] = [];
      let omitted = 0;
      for (const file of allowed.slice(0, 200)) {
        if (bytes + file.size > 110_000) {
          omitted += 1;
          continue;
        }
        const text = await file.text();
        if (text.includes("\0")) {
          omitted += 1;
          continue;
        }
        content.push(`## ${file.webkitRelativePath}\n\n${text}`);
        bytes += file.size;
      }
      omitted += Math.max(0, allowed.length - 200);
      const name = selected[0]?.webkitRelativePath.split("/")[0] || "folder";
      if (!content.length) {
        throw new Error("Folder files exceed the attachment size limit.");
      }
      attachments?.add([
        new File(
          [
            `${content.join("\n\n")}\n\n${
              omitted ? `${omitted} files omitted by the size limit.` : ""
            }`,
          ],
          `${name}.txt`,
          { type: "text/plain" }
        ),
      ]);
      if (omitted) {
        setAttachmentError(
          `${omitted} files were omitted from the folder snapshot.`
        );
      }
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "Could not attach folder."
      );
    }
  };
  return (
    <div {...stylex.props(s.root)} ref={rootElement}>
      {references.length ? (
        <div {...stylex.props(s.references)} aria-label="Selected context">
          {references.map((item, i) => (
            <span {...stylex.props(s.reference)} key={item.source + item.name}>
              <BookOpen size={12} />
              <span>{item.name}</span>
              <button
                type="button"
                {...stylex.props(s.close)}
                aria-label={`Remove ${item.name}`}
                onClick={() =>
                  onReferencesChange(references.filter((_, j) => j !== i))
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <AgentDraftEditor
        ref={(node) => {
          editor.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        suggestionList={
          trigger && visible.length
            ? { id: menuId, activeId: `${menuId}-${active}` }
            : undefined
        }
        value={draft}
        onChange={onChange}
        placeholder={placeholder}
        compact={compact}
        onTrigger={(next) => {
          setTrigger(next);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (!trigger) {
            return false;
          }
          if (event.key === "Escape") {
            setTrigger(undefined);
            event.preventDefault();
            return true;
          }
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            setIndex(
              (active + (event.key === "ArrowDown" ? 1 : -1) + visible.length) %
                Math.max(1, visible.length)
            );
            event.preventDefault();
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            if (visible[active]) {
              select(visible[active]);
            }
            event.preventDefault();
            return true;
          }
          return false;
        }}
      />
      {trigger ? (
        <div
          {...stylex.props(s.menu)}
          ref={list}
          id={menuId}
          role="listbox"
          aria-label={
            trigger.kind === "/" ? "Commands and Skills" : "Add context"
          }
        >
          <div {...stylex.props(s.menuHint)}>
            {trigger.kind === "/" ? "Commands & Skills" : "Add context"}
            <span>↑↓ · Enter · Esc</span>
          </div>
          {visible.map((entry, i) => (
            <div key={entry.group + entry.id}>
              {i === 0 || visible[i - 1]?.group !== entry.group ? (
                <div {...stylex.props(s.group)}>{entry.group}</div>
              ) : null}
              <button
                type="button"
                id={`${menuId}-${i}`}
                role="option"
                aria-selected={active === i}
                data-active={active === i}
                {...stylex.props(s.entry)}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setIndex(i)}
                onClick={() => select(entry)}
              >
                <entry.icon size={14} {...stylex.props(s.icon)} />
                <span {...stylex.props(s.entryText)}>
                  <span {...stylex.props(s.entryLabel)}>{entry.label}</span>
                  <small {...stylex.props(s.entryDescription)}>
                    {entry.description}
                  </small>
                </span>
              </button>
            </div>
          ))}
          {visible.length ? null : (
            <p {...stylex.props(s.empty)}>No matches. Try another name.</p>
          )}
        </div>
      ) : null}
      {attachmentError ? (
        <p role="status" {...stylex.props(s.notice)}>
          {attachmentError}
          <button
            type="button"
            {...stylex.props(s.close)}
            aria-label="Dismiss attachment notice"
            onClick={() => setAttachmentError("")}
          >
            <X size={12} />
          </button>
        </p>
      ) : null}
      <input
        type="file"
        multiple
        hidden
        ref={files}
        aria-label="Mention files"
        onChange={(e) => {
          attachments?.add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        type="file"
        multiple
        hidden
        ref={folder}
        aria-label="Mention folder"
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          void attachFolder(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
