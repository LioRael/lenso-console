export type PromptComposerSubmitShortcut = "enter" | "mod-enter" | "none";

export interface PromptComposerKeyGesture {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export function shouldSubmitPrompt(
  gesture: PromptComposerKeyGesture,
  shortcut: PromptComposerSubmitShortcut
): boolean {
  if (
    shortcut === "none" ||
    gesture.key !== "Enter" ||
    gesture.isComposing ||
    gesture.altKey ||
    gesture.shiftKey
  ) {
    return false;
  }

  const hasModifier = gesture.metaKey || gesture.ctrlKey;
  return shortcut === "mod-enter" ? hasModifier : !hasModifier;
}
