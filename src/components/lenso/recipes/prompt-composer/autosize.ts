export function normalizePromptComposerMaxRows(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 8;
}

function numberFromCss(value: string): number {
  const parsed = Number(value.endsWith("px") ? value.slice(0, -2) : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function autosizePromptComposerInput(
  textarea: HTMLTextAreaElement,
  maxRows: number
): void {
  const computed = window.getComputedStyle(textarea);
  const fontSize = numberFromCss(computed.fontSize);
  const lineHeight = numberFromCss(computed.lineHeight) || fontSize * 1.5;
  const padding =
    numberFromCss(computed.paddingBlockStart) +
    numberFromCss(computed.paddingBlockEnd);
  const border =
    numberFromCss(computed.borderBlockStartWidth) +
    numberFromCss(computed.borderBlockEndWidth);
  const maximumHeight =
    lineHeight * normalizePromptComposerMaxRows(maxRows) + padding + border;

  textarea.style.height = "auto";
  const contentHeight = textarea.scrollHeight + border;
  textarea.style.height = `${Math.min(contentHeight, maximumHeight)}px`;
  textarea.style.overflowY = contentHeight > maximumHeight ? "auto" : "hidden";
}

function reflowSignature(textarea: HTMLTextAreaElement): string {
  const computed = window.getComputedStyle(textarea);
  return [
    textarea.getBoundingClientRect().width,
    computed.fontFamily,
    computed.fontSize,
    computed.lineHeight,
    computed.paddingBlockStart,
    computed.paddingBlockEnd,
  ].join(":");
}

export function observePromptComposerReflow(
  textarea: HTMLTextAreaElement,
  onReflow: () => void
): () => void {
  let signature = reflowSignature(textarea);
  const handleReflow = () => {
    const nextSignature = reflowSignature(textarea);
    if (nextSignature === signature) {
      return;
    }
    signature = nextSignature;
    onReflow();
  };

  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", handleReflow);
    return () => window.removeEventListener("resize", handleReflow);
  }

  const observer = new ResizeObserver(handleReflow);
  observer.observe(textarea);
  return () => observer.disconnect();
}
