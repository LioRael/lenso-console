import { Placeholder } from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import "./agent-draft-editor.css";

export type DraftTrigger = {
  kind: "/" | "@";
  query: string;
  from: number;
  to: number;
};
export type DraftEditorHandle = {
  focus: () => void;
  choose: (text: string) => void;
  format: (kind: string) => void;
};
export function AgentDraftEditor({
  value,
  onChange,
  onTrigger,
  onKeyDown,
  placeholder,
  suggestionList,
  compact,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  onTrigger: (trigger: DraftTrigger | undefined) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
  suggestionList?: { id: string; activeId: string } | undefined;
  placeholder: string;
  compact?: boolean | undefined;
  ref?: Ref<DraftEditorHandle>;
}) {
  const callbacks = useRef({ onChange, onTrigger, onKeyDown });
  callbacks.current = { onChange, onTrigger, onKeyDown };
  const lastSent = useRef(value);
  const trigger = useRef<DraftTrigger>(undefined);
  const updateTrigger = (editor: Editor) => {
    const { $from, empty, from } = editor.state.selection;
    const text = $from.parent.textBetween(
      0,
      $from.parentOffset,
      undefined,
      "\uFFFC"
    );
    const match =
      empty &&
      !editor.isActive("codeBlock") &&
      /(?:^|\s)([/@])([^\s/@]*)$/u.exec(text);
    trigger.current = match
      ? {
          kind: match[1] as "/" | "@",
          query: match[2] ?? "",
          from: from - (match[2]?.length ?? 0) - 1,
          to: from,
        }
      : undefined;
    callbacks.current.onTrigger(trigger.current);
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
        heading: { levels: [1, 2, 3] },
      }),
      Markdown,
      TableKit,
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Send a message to Lenso Agent",
        "aria-multiline": "true",
        spellcheck: "true",
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing || view.composing) {
          return false;
        }
        if (callbacks.current.onKeyDown(event)) {
          return true;
        }
        if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
          // Structured blocks retain Enter for editing; Mod+Enter always sends.
          const parent = view.state.selection.$from.parent.type.name;
          const inList = (() => {
            for (let i = view.state.selection.$from.depth; i > 0; i -= 1) {
              if (
                ["listItem", "taskItem", "tableCell", "tableHeader"].includes(
                  view.state.selection.$from.node(i).type.name
                )
              ) {
                return true;
              }
            }
            return false;
          })();
          if (
            !event.metaKey &&
            !event.ctrlKey &&
            (parent === "codeBlock" || inList)
          ) {
            return false;
          }
          event.preventDefault();
          view.dom.closest("form")?.requestSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: updated }) => {
      const markdown = updated.getMarkdown();
      lastSent.current = markdown;
      callbacks.current.onChange(markdown);
      updateTrigger(updated);
    },
    onSelectionUpdate: ({ editor: updated }) => updateTrigger(updated),
    onBlur: () => callbacks.current.onTrigger(undefined),
  });
  useEffect(() => {
    if (editor && value !== lastSent.current) {
      lastSent.current = value;
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [editor, value]);
  useEffect(() => {
    if (!editor) {
      return;
    }
    const { dom } = editor.view;
    if (suggestionList) {
      dom.setAttribute("aria-autocomplete", "list");
      dom.setAttribute("aria-controls", suggestionList.id);
      dom.setAttribute("aria-activedescendant", suggestionList.activeId);
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    }
  }, [editor, suggestionList]);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editor?.commands.focus();
      },
      choose: (text) => {
        if (!editor) {
          return;
        }
        const chain = editor.chain().focus();
        if (trigger.current) {
          chain.deleteRange({
            from: trigger.current.from,
            to: trigger.current.to,
          });
        }
        chain.insertContent(text).run();
        callbacks.current.onTrigger(undefined);
      },
      format: (kind) => {
        if (!editor) {
          return;
        }
        const chain = editor.chain().focus();
        if (trigger.current) {
          chain.deleteRange({
            from: trigger.current.from,
            to: trigger.current.to,
          });
        }
        if (kind === "table") {
          chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
        } else if (kind === "heading") {
          chain.setHeading({ level: 2 });
        } else if (kind === "bullet") {
          chain.toggleBulletList();
        } else if (kind === "task") {
          chain.toggleTaskList();
        } else if (kind === "code") {
          chain.toggleCodeBlock();
        } else if (kind === "quote") {
          chain.toggleBlockquote();
        }
        chain.run();
        callbacks.current.onTrigger(undefined);
      },
    }),
    [editor]
  );
  return (
    <EditorContent
      editor={editor}
      className="agent-draft-editor"
      data-compact={compact || undefined}
    />
  );
}
