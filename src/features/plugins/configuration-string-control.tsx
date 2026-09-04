import { Button } from "@lenso/ui/button";
import { TextArea } from "@lenso/ui/text-area";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";

const styles = stylex.create({
  root: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "start",
    gap: tokens.space2,
    minWidth: 0,
  },
  expanded: { gridTemplateColumns: "minmax(0, 1fr)" },
  control: { width: "100%", minWidth: 0 },
  actions: { display: "flex", justifyContent: "flex-end" },
});

export function ConfigurationStringControl({
  disabled,
  id,
  label,
  onChange,
  required,
  value,
  minLength,
  maxLength,
  pattern,
  placeholder,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: unknown) => void;
  required: boolean;
  value: unknown;
  minLength: number | undefined;
  maxLength: number | undefined;
  pattern: string | undefined;
  placeholder: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof value === "string" ? value : "";
  const hasLineBreak = /[\r\n]/u.test(text);
  const multiline = expanded || hasLineBreak;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusRequested = useRef(false);
  const pasteCaret = useRef<number | null>(null);
  useEffect(() => {
    if (focusRequested.current) {
      (multiline ? areaRef.current : inputRef.current)?.focus();
      if (multiline && pasteCaret.current !== null) {
        areaRef.current?.setSelectionRange(
          pasteCaret.current,
          pasteCaret.current
        );
        pasteCaret.current = null;
      }
      focusRequested.current = false;
    }
  }, [multiline]);
  useEffect(() => {
    const area = areaRef.current;
    if (!area) {
      return;
    }
    area.setCustomValidity("");
    if (pattern && text !== "") {
      try {
        if (!new RegExp(`^(?:${pattern})$`, "v").test(text)) {
          area.setCustomValidity("Use the required format.");
        }
      } catch {
        // Invalid patterns remain the configuration authority's responsibility.
      }
    }
  }, [pattern, text, multiline]);
  const update = (next: string) =>
    onChange(next === "" && !required ? undefined : next);
  return (
    <div {...stylex.props(styles.root, multiline && styles.expanded)}>
      {multiline ? (
        <TextArea.Root xstyle={styles.control}>
          <TextArea.Control
            ref={areaRef}
            id={id}
            aria-label={label}
            disabled={disabled}
            value={text}
            rows={6}
            minLength={minLength}
            maxLength={maxLength}
            required={required}
            onChange={(event) => {
              setExpanded(true);
              update(event.currentTarget.value);
            }}
          />
        </TextArea.Root>
      ) : (
        <TextField.Root size="compact" xstyle={styles.control}>
          <TextField.Control
            ref={inputRef}
            id={id}
            aria-label={label}
            disabled={disabled}
            value={text}
            minLength={minLength}
            maxLength={maxLength}
            required={required}
            pattern={pattern}
            placeholder={placeholder}
            onChange={(event) => update(event.currentTarget.value)}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text/plain");
              if (/[\r\n]/u.test(pasted)) {
                event.preventDefault();
                const input = event.currentTarget;
                focusRequested.current = true;
                setExpanded(true);
                const before = text.slice(
                  0,
                  input.selectionStart ?? text.length
                );
                const after = text.slice(input.selectionEnd ?? text.length);
                const inserted =
                  maxLength === undefined
                    ? pasted
                    : pasted.slice(
                        0,
                        Math.max(0, maxLength - before.length - after.length)
                      );
                pasteCaret.current = before.length + inserted.length;
                update(before + inserted + after);
              }
            }}
          />
        </TextField.Root>
      )}
      {hasLineBreak ? null : (
        <div {...stylex.props(styles.actions)}>
          <Button
            size="compact"
            variant="ghost"
            aria-label={`${multiline ? "Collapse" : "Expand"} ${label} editor`}
            aria-expanded={multiline}
            onClick={() => {
              focusRequested.current = true;
              setExpanded(!expanded);
            }}
          >
            {multiline ? "Collapse" : "Expand"}
          </Button>
        </div>
      )}
    </div>
  );
}
