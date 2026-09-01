"use client";

import { Surface } from "@lenso/ui/surface";
import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import {
  autosizePromptComposerInput,
  normalizePromptComposerMaxRows,
  observePromptComposerReflow,
} from "./autosize";
import {
  shouldSubmitPrompt,
  type PromptComposerSubmitShortcut,
} from "./keyboard";
import { promptComposerStyles as styles } from "./prompt-composer.stylex";

interface PromptComposerContextValue {
  maxRows: number;
  onValueChange: (value: string) => void;
  submitShortcut: PromptComposerSubmitShortcut;
  value: string;
}

const PromptComposerContext =
  React.createContext<PromptComposerContextValue | null>(null);

function usePromptComposer(): PromptComposerContextValue {
  const context = React.useContext(PromptComposerContext);
  if (!context) {
    throw new Error(
      "PromptComposer parts must be rendered inside PromptComposer.Root"
    );
  }
  return context;
}

function mergeClassName(generated?: string, className?: string): string {
  return [generated, className].filter(Boolean).join(" ");
}

function assignRef<Value>(
  ref: React.ForwardedRef<Value>,
  value: Value | null
): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

export interface PromptComposerRootProps extends Omit<
  React.ComponentPropsWithoutRef<"form">,
  "onChange"
> {
  maxRows?: number;
  onValueChange: (value: string) => void;
  surfaceXstyle?: stylex.StyleXStyles;
  submitShortcut?: PromptComposerSubmitShortcut;
  value: string;
  xstyle?: stylex.StyleXStyles;
}

export const PromptComposerRoot = React.forwardRef<
  HTMLFormElement,
  PromptComposerRootProps
>(
  (
    {
      children,
      className,
      maxRows = 8,
      onValueChange,
      surfaceXstyle,
      submitShortcut = "mod-enter",
      value,
      xstyle,
      ...props
    },
    ref
  ) => {
    const context = React.useMemo<PromptComposerContextValue>(
      () => ({
        maxRows: normalizePromptComposerMaxRows(maxRows),
        onValueChange,
        submitShortcut,
        value,
      }),
      [maxRows, onValueChange, submitShortcut, value]
    );

    return (
      <PromptComposerContext.Provider value={context}>
        <Surface level="panel" xstyle={[styles.surface, surfaceXstyle]}>
          <form
            {...props}
            className={mergeClassName(
              stylex.props(styles.root, xstyle).className,
              className
            )}
            data-slot="prompt-composer"
            ref={ref}
          >
            {children}
          </form>
        </Surface>
      </PromptComposerContext.Provider>
    );
  }
);
PromptComposerRoot.displayName = "PromptComposer.Root";

export interface PromptComposerInputProps extends Omit<
  React.ComponentPropsWithoutRef<"textarea">,
  "defaultValue" | "onChange" | "value"
> {
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  xstyle?: stylex.StyleXStyles;
}

export const PromptComposerInput = React.forwardRef<
  HTMLTextAreaElement,
  PromptComposerInputProps
>(
  (
    { className, onChange, onKeyDown, rows = 1, xstyle, ...props },
    forwardedRef
  ) => {
    const { maxRows, onValueChange, submitShortcut, value } =
      usePromptComposer();
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const resize = React.useCallback(() => {
      if (textareaRef.current) {
        autosizePromptComposerInput(textareaRef.current, maxRows);
      }
    }, [maxRows]);

    React.useLayoutEffect(resize, [resize, value]);

    React.useLayoutEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      return observePromptComposerReflow(textarea, resize);
    }, [resize]);

    return (
      <textarea
        {...props}
        className={mergeClassName(
          stylex.props(styles.input, xstyle).className,
          className
        )}
        data-slot="prompt-composer-input"
        onChange={(event) => {
          onValueChange(event.currentTarget.value);
          onChange?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) {
            return;
          }

          if (
            shouldSubmitPrompt(
              {
                altKey: event.altKey,
                ctrlKey: event.ctrlKey,
                isComposing: event.nativeEvent.isComposing,
                key: event.key,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey,
              },
              submitShortcut
            )
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        ref={(node) => {
          textareaRef.current = node;
          assignRef(forwardedRef, node);
        }}
        rows={rows}
        value={value}
      />
    );
  }
);
PromptComposerInput.displayName = "PromptComposer.Input";

export type PromptComposerToolbarProps =
  React.ComponentPropsWithoutRef<"div"> & { xstyle?: stylex.StyleXStyles };

export const PromptComposerToolbar = React.forwardRef<
  HTMLDivElement,
  PromptComposerToolbarProps
>(({ className, xstyle, ...props }, ref) => (
  <div
    {...props}
    className={mergeClassName(
      stylex.props(styles.toolbar, xstyle).className,
      className
    )}
    data-slot="prompt-composer-toolbar"
    ref={ref}
  />
));
PromptComposerToolbar.displayName = "PromptComposer.Toolbar";

export type PromptComposerActionsProps =
  React.ComponentPropsWithoutRef<"div"> & { xstyle?: stylex.StyleXStyles };

export const PromptComposerActions = React.forwardRef<
  HTMLDivElement,
  PromptComposerActionsProps
>(({ className, xstyle, ...props }, ref) => (
  <div
    {...props}
    className={mergeClassName(
      stylex.props(styles.actions, xstyle).className,
      className
    )}
    data-slot="prompt-composer-actions"
    ref={ref}
  />
));
PromptComposerActions.displayName = "PromptComposer.Actions";

export const PromptComposer = {
  Actions: PromptComposerActions,
  Input: PromptComposerInput,
  Root: PromptComposerRoot,
  Toolbar: PromptComposerToolbar,
} as const;

export type { PromptComposerSubmitShortcut } from "./keyboard";
