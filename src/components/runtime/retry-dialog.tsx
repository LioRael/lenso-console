import * as stylex from "@stylexjs/stylex";
import { AlertTriangle, RotateCcw, X } from "lucide-react";

import { useRetryRuntimeWork } from "../../hooks/use-runtime-queries";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useConsole } from "./console-context";
import { StatusPill } from "./status-pill";

const localStyles = stylex.create({
  utilityFlex: {
    display: "flex",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderBorderSubtle: {
    borderColor: "var(--border-subtle)",
  },
  utilityP3: {
    padding: "calc(0.25rem * 3)",
  },
  utilityGrid: {
    display: "grid",
  },
  utilitySize8: {
    width: "calc(0.25rem * 8)",
    height: "calc(0.25rem * 8)",
  },
  utilityPlaceItemsCenter: {
    placeItems: "center",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderColorMixInSrgbVarWarning30Transparent: {
    borderColor: "color-mix(in srgb,var(--warning) 30%,transparent)",
  },
  utilityBgColorMixInSrgbVarWarning10Transparent: {
    backgroundColor: "color-mix(in srgb,var(--warning) 10%,transparent)",
  },
  utilityTextWarning: {
    color: "var(--warning)",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityMb1: {
    marginBottom: "calc(0.25rem * 1)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityTracking008em: {
    letterSpacing: "0.08em",
  },
  utilityTextMuted: {
    color: "var(--muted)",
  },
  utilityTextSm: {
    fontSize: "var(--text-sm, 0.875rem)",
    lineHeight: "var(--text-sm--line-height, 1.25rem)",
  },
  utilityTextForeground: {
    color: "var(--foreground)",
  },
  utilityGridColsAutoMinmax01fr: {
    gridTemplateColumns: "auto minmax(0,1fr)",
  },
  utilityBgElevated: {
    backgroundColor: "var(--elevated)",
  },
  utilityP25: {
    padding: "calc(0.25rem * 2.5)",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityMt05: {
    marginTop: "calc(0.25rem * 0.5)",
  },
  utilityGridCols120pxMinmax01fr: {
    gridTemplateColumns: "120px minmax(0,1fr)",
  },
  utilityGapX35: {
    columnGap: "calc(0.25rem * 3.5)",
  },
  utilityGapY15: {
    rowGap: "calc(0.25rem * 1.5)",
  },
  utilityTextSecondary: {
    color: "var(--secondary)",
  },
  utilityBorderColorMixInSrgbVarWarning28Transparent: {
    borderColor: "color-mix(in srgb,var(--warning) 28%,transparent)",
  },
  utilityBgColorMixInSrgbVarWarning9Transparent: {
    backgroundColor: "color-mix(in srgb,var(--warning) 9%,transparent)",
  },
  utilityLeading5: {
    lineHeight: "calc(0.25rem * 5)",
  },
  utilityTextColorMixInSrgbVarWarning72VarForeground: {
    color: "color-mix(in srgb,var(--warning) 72%,var(--foreground))",
  },
  utilityJustifyEnd: {
    justifyContent: "flex-end",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilityMx3: {
    marginInline: "calc(0.25rem * 3)",
  },
  utilityMb3: {
    marginBottom: "calc(0.25rem * 3)",
  },
  utilityBorderColorMixInSrgbVarError30Transparent: {
    borderColor: "color-mix(in srgb,var(--error) 30%,transparent)",
  },
  utilityBgColorMixInSrgbVarError8Transparent: {
    backgroundColor: "color-mix(in srgb,var(--error) 8%,transparent)",
  },
  utilityTextError: {
    color: "var(--error)",
  },
});

const styles = stylex.create({
  closeButton: { marginInlineStart: "auto" },
});

export function RetryDialog() {
  const { closeRetry, retryTarget } = useConsole();
  const retryMutation = useRetryRuntimeWork();

  return (
    <Dialog
      onOpenChange={(open) => !open && closeRetry()}
      open={Boolean(retryTarget)}
    >
      {retryTarget ? (
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <header
              {...stylex.props([
                localStyles.utilityFlex,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap3,
                localStyles.utilityBorderB,
                localStyles.utilityBorderBorderSubtle,
                localStyles.utilityP3,
              ])}
            >
              <div
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilitySize8,
                  localStyles.utilityPlaceItemsCenter,
                  localStyles.utilityBorder,
                  localStyles.utilityBorderColorMixInSrgbVarWarning30Transparent,
                  localStyles.utilityBgColorMixInSrgbVarWarning10Transparent,
                  localStyles.utilityTextWarning,
                ])}
              >
                <AlertTriangle size={18} />
              </div>
              <div {...stylex.props([localStyles.utilityMinW0])}>
                <p
                  {...stylex.props([
                    localStyles.utilityMb1,
                    localStyles.utilityFontMono,
                    localStyles.utilityText10px,
                    localStyles.utilityFontSemibold,
                    localStyles.utilityUppercase,
                    localStyles.utilityTracking008em,
                    localStyles.utilityTextMuted,
                  ])}
                >
                  Retry confirmation
                </p>
                <Dialog.Title
                  {...stylex.props([
                    localStyles.utilityFontMono,
                    localStyles.utilityTextSm,
                    localStyles.utilityFontSemibold,
                    localStyles.utilityTextForeground,
                  ])}
                >
                  Replay runtime work?
                </Dialog.Title>
              </div>
              <Button
                aria-label="Close retry dialog"
                stylex={styles.closeButton}
                onClick={closeRetry}
                variant="ghost"
              >
                <X size={15} />
              </Button>
            </header>

            <div
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityGap3,
                localStyles.utilityP3,
              ])}
            >
              <div
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityGridColsAutoMinmax01fr,
                  localStyles.utilityItemsCenter,
                  localStyles.utilityGap3,
                  localStyles.utilityBorder,
                  localStyles.utilityBorderBorderSubtle,
                  localStyles.utilityBgElevated,
                  localStyles.utilityP25,
                ])}
              >
                <StatusPill status={retryTarget.status} />
                <div {...stylex.props([localStyles.utilityMinW0])}>
                  <div
                    {...stylex.props([
                      localStyles.utilityTruncate,
                      localStyles.utilityFontMono,
                      localStyles.utilityText11px,
                      localStyles.utilityFontSemibold,
                      localStyles.utilityTextForeground,
                    ])}
                  >
                    {retryTarget.name}
                  </div>
                  <div
                    {...stylex.props([
                      localStyles.utilityMt05,
                      localStyles.utilityTruncate,
                      localStyles.utilityFontMono,
                      localStyles.utilityText10px,
                      localStyles.utilityTextMuted,
                    ])}
                  >
                    {retryTarget.kind} · {retryTarget.id}
                  </div>
                </div>
              </div>

              <dl
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityGridCols120pxMinmax01fr,
                  localStyles.utilityGapX35,
                  localStyles.utilityGapY15,
                  localStyles.utilityFontMono,
                  localStyles.utilityText11px,
                  localStyles.utilityTextSecondary,
                ])}
              >
                <dt {...stylex.props([localStyles.utilityTextMuted])}>
                  attempts
                </dt>
                <dd>
                  {retryTarget.attempts}/{retryTarget.maxAttempts}
                </dd>
                <dt {...stylex.props([localStyles.utilityTextMuted])}>
                  current status
                </dt>
                <dd>{retryTarget.status}</dd>
                <dt {...stylex.props([localStyles.utilityTextMuted])}>
                  operation
                </dt>
                <dd>reset to pending and make available now</dd>
              </dl>

              <Dialog.Description
                {...stylex.props([
                  localStyles.utilityBorder,
                  localStyles.utilityBorderColorMixInSrgbVarWarning28Transparent,
                  localStyles.utilityBgColorMixInSrgbVarWarning9Transparent,
                  localStyles.utilityP25,
                  localStyles.utilityFontMono,
                  localStyles.utilityText11px,
                  localStyles.utilityLeading5,
                  localStyles.utilityTextColorMixInSrgbVarWarning72VarForeground,
                ])}
              >
                Retry is safe only when the handler is idempotent. Check
                downstream side effects before replaying this work.
              </Dialog.Description>
            </div>

            <footer
              {...stylex.props([
                localStyles.utilityFlex,
                localStyles.utilityJustifyEnd,
                localStyles.utilityGap2,
                localStyles.utilityBorderT,
                localStyles.utilityBorderBorderSubtle,
                localStyles.utilityP3,
              ])}
            >
              <Button onClick={closeRetry} variant="ghost">
                Cancel
              </Button>
              <Button
                disabled={retryMutation.isPending}
                onClick={() => {
                  retryMutation.mutate(
                    { id: retryTarget.id, kind: retryTarget.kind },
                    { onSuccess: closeRetry }
                  );
                }}
                variant="danger"
              >
                <RotateCcw size={15} />
                {retryMutation.isPending ? "Retrying..." : "Retry"}
              </Button>
            </footer>
            {retryMutation.isError ? (
              <div
                {...stylex.props([
                  localStyles.utilityMx3,
                  localStyles.utilityMb3,
                  localStyles.utilityBorder,
                  localStyles.utilityBorderColorMixInSrgbVarError30Transparent,
                  localStyles.utilityBgColorMixInSrgbVarError8Transparent,
                  localStyles.utilityP25,
                  localStyles.utilityFontMono,
                  localStyles.utilityText11px,
                  localStyles.utilityTextError,
                ])}
              >
                {errorMessage(retryMutation.error)}
              </div>
            ) : null}
          </Dialog.Popup>
        </Dialog.Portal>
      ) : null}
    </Dialog>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Retry failed";
}
