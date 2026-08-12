import { Tabs } from "@base-ui/react/tabs";
import { useConsoleLocale } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Network,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";

import type {
  RuntimeStory,
  ExecutionLogCoverage,
  ExecutionNode,
  ExecutionLogEntry,
  ExecutionPayload,
  TechnicalOperation,
} from "../../data/mock-runtime";
import { retryTargetForNode } from "../../data/mock-runtime";
import {
  useExecutionLogs,
  useExecutionPayload,
  useExecutionTechnicalOperations,
  useStoryTechnicalOperations,
} from "../../hooks/use-runtime-queries";
import { prettyJson } from "../../lib/format";
import { formatRuntimeDuration } from "../../lib/runtime-style";
import { useConsole } from "./console-context";
import {
  buildExecutionActivity,
  buildExecutionContext,
  buildExecutionFailures,
  buildProviderCallInspectorDetail,
  executionLogCoverageContext,
  executionLogPresentation,
  executionInspectorTabs,
  getExecutionInspectorTabCounts,
  type ExecutionActivityItem,
  type ExecutionInspectorTab,
} from "./execution-inspector-model";
import { HorizontalTabScroll } from "./horizontal-tab-scroll";
import { JsonViewer } from "./json-viewer";
import {
  buildTechnicalOperationGroups,
  technicalOperationCount,
  technicalOperationOperationsTarget,
  technicalOperationsStateLabel,
  type TechnicalOperationGroup,
  type TechnicalOperationView,
} from "./technical-operations-model";

const localStyles = stylex.create({
  utilityFlex: {
    display: "flex",
  },
  utilityH4: {
    height: "calc(0.25rem * 4)",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityPx3: {
    paddingInline: "calc(0.25rem * 3)",
  },
  utilityText9px: {
    fontSize: "9px",
  },
  utilityLeadingNone: {
    lineHeight: "1",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilityTruncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityHoverTextFgPrimary: {
    ":hover": {
      color: "var(--fg-primary)",
    },
  },
  utilityMaxW22: {
    maxWidth: "calc(0.25rem * 22)",
  },
  utilitySize25: {
    width: "calc(0.25rem * 2.5)",
    height: "calc(0.25rem * 2.5)",
  },
  utilityH8: {
    height: "calc(0.25rem * 8)",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
  },
  utilityFlex1: {
    flex: "1",
  },
  utilityText13px: {
    fontSize: "13px",
  },
  utilityFontSemibold: {
    fontWeight: "600",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityInlineFlex: {
    display: "inline-flex",
  },
  utilityH7: {
    height: "calc(0.25rem * 7)",
  },
  utilityW68px: {
    width: "68px",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityJustifyCenter: {
    justifyContent: "center",
  },
  utilityRoundedVarRadiusControl: {
    borderRadius: "var(--radius-control)",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgControl: {
    backgroundColor: "var(--bg-control)",
  },
  utilityPx25: {
    paddingInline: "calc(0.25rem * 2.5)",
  },
  utilityText12px: {
    fontSize: "12px",
  },
  utilityHoverBgBgControlHover: {
    ":hover": {
      backgroundColor: "var(--bg-control-hover)",
    },
  },
  utilityH17px: {
    height: "17px",
  },
  utilityGap15: {
    gap: "calc(0.25rem * 1.5)",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityHFull: {
    height: "100%",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityBorderLineSubtle: {
    borderColor: "var(--line-subtle)",
  },
  utilityBgBgCanvas: {
    backgroundColor: "var(--bg-canvas)",
  },
  utilityGap3px: {
    gap: "3px",
  },
  utilityFontSans: {
    fontFamily:
      "var(--font-sans, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',\n    'Noto Color Emoji')",
  },
  utilitySize2px: {
    width: "2px",
    height: "2px",
  },
  utilityRoundedFull: {
    borderRadius: "calc(infinity * 1px)",
  },
  utilityBgFgSecondary: {
    backgroundColor: "var(--fg-secondary)",
  },
  utilityBgFgTertiary: {
    backgroundColor: "var(--fg-tertiary)",
  },
  utilityMx3: {
    marginInline: "calc(0.25rem * 3)",
  },
  utilityMb3: {
    marginBottom: "calc(0.25rem * 3)",
  },
  utilityBorderVarToneErrorBorder: {
    borderColor: "var(--tone-error-border)",
  },
  utilityPx2: {
    paddingInline: "calc(0.25rem * 2)",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityTextToneErrorFg: {
    color: "var(--tone-error-fg)",
  },
  utilityMinWFull: {
    minWidth: "100%",
  },
  utilityH11: {
    height: "calc(0.25rem * 11)",
  },
  utilityPt25: {
    paddingTop: "calc(0.25rem * 2.5)",
  },
  utilityPb9px: {
    paddingBottom: "9px",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityH348px: {
    height: "348px",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityPy14px: {
    paddingBlock: "14px",
  },
  utilityLeading15px: {
    lineHeight: "15px",
  },
  utilityText95px: {
    fontSize: "9.5px",
  },
  utilityUppercase: {
    textTransform: "uppercase",
  },
  utilityH210px: {
    height: "210px",
  },
  utilityPy3: {
    paddingBlock: "calc(0.25rem * 3)",
  },
  utilityTextRight: {
    textAlign: "right",
  },
  utilityH132px: {
    height: "132px",
  },
  utilityGap6px: {
    gap: "6px",
  },
  utilityPy2: {
    paddingBlock: "calc(0.25rem * 2)",
  },
  utilityH42px: {
    height: "42px",
  },
  utilityH9: {
    height: "calc(0.25rem * 9)",
  },
  utilityW220px: {
    width: "220px",
  },
  utilityGap05: {
    gap: "calc(0.25rem * 0.5)",
  },
  utilityTextXs: {
    fontSize: "var(--text-xs, 0.75rem)",
    lineHeight: "var(--text-xs--line-height, 1rem)",
  },
  utilityH98px: {
    height: "98px",
  },
  utilityPt11px: {
    paddingTop: "11px",
  },
  utilityPb25: {
    paddingBottom: "calc(0.25rem * 2.5)",
  },
  utilityMt15: {
    marginTop: "calc(0.25rem * 1.5)",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
  utilityMaxWFull: {
    maxWidth: "100%",
  },
  utilityGrid: {
    display: "grid",
  },
  utilityH58px: {
    height: "58px",
  },
  utilityGridCols3: {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  },
  utilityGap4: {
    gap: "calc(0.25rem * 4)",
  },
  utilityPy25: {
    paddingBlock: "calc(0.25rem * 2.5)",
  },
  utilityH30px: {
    height: "30px",
  },
  utilityGridCols92pxMinmax01fr: {
    gridTemplateColumns: "92px minmax(0,1fr)",
  },
  utilityGridCols60px102px62pxMinmax01fr: {
    gridTemplateColumns: "60px 102px 62px minmax(0,1fr)",
  },
  utilityText85px: {
    fontSize: "8.5px",
  },
  utilityFontNormal: {
    fontWeight: "400",
  },
  utilityH60px: {
    height: "60px",
  },
  utilityW92px: {
    width: "92px",
  },
  utilityLeading17px: {
    lineHeight: "17px",
  },
  utilityTextToneSuccessFg: {
    color: "var(--tone-success-fg)",
  },
  utilityMt3px: {
    marginTop: "3px",
  },
  utilityRelative: {
    position: "relative",
  },
  utilityH122px: {
    height: "122px",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityTop60px: {
    top: "60px",
  },
  utilityRight7: {
    right: "calc(0.25rem * 7)",
  },
  utilityLeft7: {
    left: "calc(0.25rem * 7)",
  },
  utilityHPx: {
    height: "1px",
  },
  utilityBgLineSubtle: {
    backgroundColor: "var(--line-subtle)",
  },
  utilityTop37px: {
    top: "37px",
  },
  utilityRight3: {
    right: "calc(0.25rem * 3)",
  },
  utilityLeft3: {
    left: "calc(0.25rem * 3)",
  },
  utilityTextCenter: {
    textAlign: "center",
  },
  utilityPx1: {
    paddingInline: "calc(0.25rem * 1)",
  },
  utilityMxAuto: {
    marginInline: "auto",
  },
  utilityMt3: {
    marginTop: "calc(0.25rem * 3)",
  },
  utilityBlock: {
    display: "block",
  },
  utilitySize15: {
    width: "calc(0.25rem * 1.5)",
    height: "calc(0.25rem * 1.5)",
  },
  utilitySize2: {
    width: "calc(0.25rem * 2)",
    height: "calc(0.25rem * 2)",
  },
  utilityTranslateYPx: {
    transform: "translateY(-1px)",
  },
  utilityBgToneSuccessFg: {
    backgroundColor: "var(--tone-success-fg)",
  },
  utilityMt2: {
    marginTop: "calc(0.25rem * 2)",
  },
  utilityBottom3: {
    bottom: "calc(0.25rem * 3)",
  },
  utilitySize5px: {
    width: "5px",
    height: "5px",
  },
  utilityBgAccent: {
    backgroundColor: "var(--accent)",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityBgBgPanelHeader: {
    backgroundColor: "var(--bg-panel-header)",
  },
  utilityPy15: {
    paddingBlock: "calc(0.25rem * 1.5)",
  },
  utilityH5: {
    height: "calc(0.25rem * 5)",
  },
  utilityPx15: {
    paddingInline: "calc(0.25rem * 1.5)",
  },
  utilityH278px: {
    height: "278px",
  },
  utilityOverflowVisible: {
    overflow: "visible",
  },
  utilityP3: {
    padding: "calc(0.25rem * 3)",
  },
  utilityH26px: {
    height: "26px",
  },
  utilityH84px: {
    height: "84px",
  },
  utilityGap25: {
    gap: "calc(0.25rem * 2.5)",
  },
  utilityW13px: {
    width: "13px",
  },
  utilityTextAccent: {
    color: "var(--accent)",
  },
  utilityH68px: {
    height: "68px",
  },
  utilityW256px: {
    width: "256px",
  },
  utilityGap5px: {
    gap: "5px",
  },
  utilityH18px: {
    height: "18px",
  },
  utilityItemsStart: {
    alignItems: "flex-start",
  },
  utilityTop2: {
    top: "calc(0.25rem * 2)",
  },
  utilityRight0: {
    right: "calc(0.25rem * 0)",
  },
  utilityMr1: {
    marginRight: "calc(0.25rem * 1)",
  },
  utilitySize4: {
    width: "calc(0.25rem * 4)",
    height: "calc(0.25rem * 4)",
  },
  utilityPlaceItemsCenter: {
    placeItems: "center",
  },
  utilityTransitionOpacity: {
    transitionProperty: "opacity",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityTopFull: {
    top: "100%",
  },
  utilityLeft0: {
    left: "calc(0.25rem * 0)",
  },
  utilityZ10: {
    zIndex: "10",
  },
  utilityMinH9: {
    minHeight: "calc(0.25rem * 9)",
  },
  utilityLastBorderB0: {
    ":last-child": {
      borderBottomWidth: "0px",
    },
  },
  utilityWhitespacePreWrap: {
    whiteSpace: "pre-wrap",
  },
  utilityH108px: {
    height: "108px",
  },
  utilityWFull: {
    width: "100%",
  },
  utilityW3: {
    width: "calc(0.25rem * 3)",
  },
  utilityTop0: {
    top: "calc(0.25rem * 0)",
  },
  utilityLeft12: {
    left: "calc(1 / 2 * 100%)",
  },
  utilityTranslateX12: {
    transform: "translateX(calc(50% * -1))",
  },
  utilityBgFgPrimary: {
    backgroundColor: "var(--fg-primary)",
  },
  utilityBottom2: {
    bottom: "calc(0.25rem * 2)",
  },
  utilityWPx: {
    width: "1px",
  },
  utilityW284px: {
    width: "284px",
  },
  utilityGap7px: {
    gap: "7px",
  },
  utilityPt0: {
    paddingTop: "calc(0.25rem * 0)",
  },
  utilityLeading0: {
    lineHeight: "0",
  },
  utilityLeadingNormal: {
    lineHeight: "normal",
  },
  utilityMinHFull: {
    minHeight: "100%",
  },
  utilityPy7px: {
    paddingBlock: "7px",
  },
  utilityW7px: {
    width: "7px",
  },
  utilityTextToneWarningFg: {
    color: "var(--tone-warning-fg)",
  },
  utilityW260px: {
    width: "260px",
  },
  utilityH44px: {
    height: "44px",
  },
  utilityLeadingNormal2: {
    lineHeight: "var(--leading-normal, 1.5)",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityH52px: {
    height: "52px",
  },
  utilityTextLeft: {
    textAlign: "left",
  },
  utilitySize3: {
    width: "calc(0.25rem * 3)",
    height: "calc(0.25rem * 3)",
  },
  utilityWhitespaceNowrap: {
    whiteSpace: "nowrap",
  },
  utilityMaxH171px: {
    maxHeight: "171px",
  },
  utilityPb11px: {
    paddingBottom: "11px",
  },
  utilityMaxH150px: {
    maxHeight: "150px",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityH80px: {
    height: "80px",
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilityW97px: {
    width: "97px",
  },
  utilityH100px: {
    height: "100px",
  },
  utilityW49px: {
    width: "49px",
  },
  utilityH34px: {
    height: "34px",
  },
  utilityH216px: {
    height: "216px",
  },
  utilityNormalCase: {
    textTransform: "none",
  },
  utilityH27px: {
    height: "27px",
  },
  utilityH256px: {
    height: "256px",
  },
  utilityH05: {
    height: "calc(0.25rem * 0.5)",
  },
  utilityW280px: {
    width: "280px",
  },
  utilityBgToneWarningFg: {
    backgroundColor: "var(--tone-warning-fg)",
  },
  utilityP4: {
    padding: "calc(0.25rem * 4)",
  },
});

const styles = stylex.create({
  header: {
    borderBlockEndColor: "var(--line-subtle)",
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    minWidth: 0,
    overflow: "hidden",
    paddingBlockEnd: 10,
    paddingBlockStart: 18,
    position: "relative",
  },
  clearIcon: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      ":focus-visible": 1,
    },
  },
  path: { height: 17 },
  root: {
    backgroundColor: "var(--bg-canvas)",
    display: "grid",
    gridTemplateRows: "94px minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    width: "100%",
  },
  statusDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    flexShrink: 0,
    height: 6,
    width: 6,
  }),
  statusText: (color: string) => ({ color }),
  tabsRoot: {
    display: "grid",
    gridTemplateRows: "42px minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  tabsList: {
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
    height: 42,
    minWidth: "100%",
    paddingInline: 6,
    width: "max-content",
  },
  tab: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: "inherit",
    fontSize: 11,
    gap: 4,
    height: 40,
    justifyContent: "center",
    paddingInline: 4,
    position: "relative",
    color: "var(--fg-tertiary)",
  },
  tabActive: {
    borderBlockEndColor: "var(--accent)",
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    color: "var(--fg-primary)",
    fontWeight: 500,
  },
  panel: {
    backgroundColor: "var(--bg-canvas)",
    minHeight: 0,
    minWidth: 0,
    overflow: "auto",
    scrollbarWidth: "thin",
  },
  technicalOperationAttributeToggle: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      ":focus-visible": 1,
    },
  },
});

export function ExecutionInspector({
  activeTab,
  onClearSelection,
  selectedNode,
  setActiveTab,
  story,
}: {
  story: RuntimeStory;
  selectedNode: ExecutionNode;
  activeTab: ExecutionInspectorTab;
  onClearSelection: () => void;
  setActiveTab: (tab: ExecutionInspectorTab) => void;
}) {
  const { locale } = useConsoleLocale();
  const { openRetry } = useConsole();
  const zh = locale === "zh-CN";
  const node = selectedNode;
  const logsQuery = useExecutionLogs(story, node.id, activeTab === "logs");
  const tabCounts = getExecutionInspectorTabCounts(
    story,
    node,
    logsQuery.data?.entries.length
  );
  const retryTarget = retryTargetForNode(node);
  const routeLabel = buildInspectorPath(story, node);

  return (
    <aside {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH4,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityPx3,
            localStyles.utilityText9px,
            localStyles.utilityLeadingNone,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          <span
            {...stylex.props([
              localStyles.utilityTruncate,
              localStyles.utilityFontMedium,
            ])}
          >
            {inspectorKindLabel(node)}&nbsp; / &nbsp;{node.service}
          </span>
          <button
            aria-label="Clear inspector selection"
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityMinW0,
              localStyles.utilityItemsCenter,
              localStyles.utilityGap1,
              localStyles.utilityFontMono,
              localStyles.utilityText9px,
              localStyles.utilityTextFgTertiary,
              localStyles.utilityHoverTextFgPrimary,
            ])}
            {...stylex.props(stylex.defaultMarker())}
            onClick={onClearSelection}
            type="button"
          >
            <span
              {...stylex.props([
                localStyles.utilityMaxW22,
                localStyles.utilityTruncate,
              ])}
            >
              {node.id}
            </span>
            <X
              {...stylex.props([localStyles.utilitySize25])}
              {...stylex.props(styles.clearIcon)}
            />
          </button>
        </div>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH8,
            localStyles.utilityMinW0,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap2,
            localStyles.utilityPx3,
          ])}
        >
          <span
            {...stylex.props(
              styles.statusDot(statusColorForInspector(node.status))
            )}
          />
          <h2
            {...stylex.props([
              localStyles.utilityMinW0,
              localStyles.utilityFlex1,
              localStyles.utilityTruncate,
              localStyles.utilityText13px,
              localStyles.utilityFontSemibold,
              localStyles.utilityTextFgPrimary,
            ])}
          >
            {node.canonicalName ?? node.name}
          </h2>
          {retryTarget ? (
            <button
              {...stylex.props([
                localStyles.utilityInlineFlex,
                localStyles.utilityH7,
                localStyles.utilityW68px,
                localStyles.utilityShrink0,
                localStyles.utilityItemsCenter,
                localStyles.utilityJustifyCenter,
                localStyles.utilityGap1,
                localStyles.utilityRoundedVarRadiusControl,
                localStyles.utilityBorder,
                localStyles.utilityBorderLine,
                localStyles.utilityBgBgControl,
                localStyles.utilityPx25,
                localStyles.utilityText12px,
                localStyles.utilityFontMedium,
                localStyles.utilityTextFgPrimary,
                localStyles.utilityHoverBgBgControlHover,
              ])}
              onClick={() => openRetry(retryTarget)}
              type="button"
            >
              <RotateCcw size={12} />
              {zh ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH17px,
            localStyles.utilityMinW0,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap15,
            localStyles.utilityOverflowHidden,
            localStyles.utilityPx3,
            localStyles.utilityText9px,
            localStyles.utilityLeadingNone,
          ])}
        >
          <span
            {...stylex.props([
              localStyles.utilityShrink0,
              localStyles.utilityFontMedium,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {zh ? "路径" : "Path"}
          </span>
          <span
            {...stylex.props([
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityTextFgSecondary,
            ])}
            title={routeLabel}
          >
            {routeLabel}
          </span>
        </div>
      </div>

      <Tabs.Root
        {...stylex.props(styles.tabsRoot)}
        onValueChange={(value) => {
          if (typeof value === "string") {
            setActiveTab(value as ExecutionInspectorTab);
          }
        }}
        value={activeTab}
      >
        <div
          {...stylex.props([
            localStyles.utilityHFull,
            localStyles.utilityMinW0,
            localStyles.utilityOverflowHidden,
            localStyles.utilityBorderB,
            localStyles.utilityBorderLineSubtle,
            localStyles.utilityBgBgCanvas,
          ])}
        >
          <HorizontalTabScroll>
            <Tabs.List
              aria-label={zh ? "执行详情标签" : "Execution detail tabs"}
              {...stylex.props(styles.tabsList)}
            >
              {executionInspectorTabs.map((tab) => (
                <Tabs.Tab
                  {...stylex.props(
                    styles.tab,
                    activeTab === tab.id && styles.tabActive
                  )}
                  id={`execution-tab-${tab.id}`}
                  key={tab.id}
                  value={tab.id}
                >
                  <span>{zh ? inspectorTabZh[tab.id] : tab.label}</span>
                  {tabCounts[tab.id] > 0 ? (
                    <span
                      {...stylex.props(
                        [
                          localStyles.utilityInlineFlex,
                          localStyles.utilityItemsCenter,
                          localStyles.utilityGap3px,
                          localStyles.utilityFontSans,
                          localStyles.utilityText9px,
                          localStyles.utilityFontMedium,
                        ],
                        activeTab === tab.id
                          ? [localStyles.utilityTextFgSecondary]
                          : [localStyles.utilityTextFgTertiary]
                      )}
                    >
                      <span
                        {...stylex.props(
                          [
                            localStyles.utilitySize2px,
                            localStyles.utilityRoundedFull,
                          ],
                          activeTab === tab.id
                            ? [localStyles.utilityBgFgSecondary]
                            : [localStyles.utilityBgFgTertiary]
                        )}
                      />
                      {tabCounts[tab.id]}
                    </span>
                  ) : null}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </HorizontalTabScroll>
        </div>

        {executionInspectorTabs.map((tab) => (
          <Tabs.Panel
            {...stylex.props(styles.panel)}
            id={`execution-inspector-panel-${tab.id}`}
            key={`${node.id}-${tab.id}`}
            keepMounted
            value={tab.id}
          >
            {activeTab === tab.id ? (
              <InspectorBody
                activeTab={tab.id}
                logsQuery={logsQuery}
                node={node}
                story={story}
              />
            ) : null}
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </aside>
  );
}

const inspectorTabZh: Record<ExecutionInspectorTab, string> = {
  overview: "概览",
  payload: "载荷",
  logs: "日志",
  events: "事件",
  operations: "操作",
};

function InspectorBody({
  activeTab,
  logsQuery,
  node,
  story,
}: {
  story: RuntimeStory;
  node: ExecutionNode;
  activeTab: ExecutionInspectorTab;
  logsQuery: ReturnType<typeof useExecutionLogs>;
}) {
  const { openRemoteCalls, openRetry } = useConsole();
  const payloadQuery = useExecutionPayload(
    story,
    node.id,
    activeTab === "payload" || activeTab === "overview"
  );
  const executionOperationsQuery = useExecutionTechnicalOperations(
    story.correlationId,
    node.id,
    activeTab === "operations"
  );
  const storyOperationsQuery = useStoryTechnicalOperations(story.correlationId);

  if (activeTab === "overview") {
    const retryTarget = retryTargetForNode(node);
    const providerCallDetail = buildProviderCallInspectorDetail(node);
    return (
      <OverviewDocument
        logsCount={logsQuery.data?.entries.length ?? node.logs.length}
        node={node}
        payload={payloadQuery.data}
        story={story}
      >
        {providerCallDetail ? (
          <ProviderCallDetail
            detail={providerCallDetail}
            onOpenRemoteCalls={() => openRemoteCalls(story.correlationId)}
          />
        ) : null}
        {retryTarget && (node.status === "failed" || node.status === "dead") ? (
          <button
            {...stylex.props([
              localStyles.utilityMx3,
              localStyles.utilityMb3,
              localStyles.utilityInlineFlex,
              localStyles.utilityH7,
              localStyles.utilityItemsCenter,
              localStyles.utilityGap2,
              localStyles.utilityRoundedVarRadiusControl,
              localStyles.utilityBorder,
              localStyles.utilityBorderVarToneErrorBorder,
              localStyles.utilityBgBgControl,
              localStyles.utilityPx2,
              localStyles.utilityText11px,
              localStyles.utilityFontMedium,
              localStyles.utilityTextToneErrorFg,
              localStyles.utilityHoverBgBgControlHover,
            ])}
            onClick={() => openRetry(retryTarget)}
            type="button"
          >
            <RotateCcw size={12} />
            Retry execution
          </button>
        ) : null}
      </OverviewDocument>
    );
  }

  if (activeTab === "payload") {
    return (
      <PayloadDocument
        error={payloadQuery.error}
        isError={payloadQuery.isError}
        isLoading={payloadQuery.isLoading}
        node={node}
        payload={payloadQuery.data}
      />
    );
  }

  if (activeTab === "events") {
    return (
      <EventsDocument
        activity={buildExecutionActivity(story, node)}
        failures={buildExecutionFailures(node)}
        node={node}
      />
    );
  }

  if (activeTab === "logs") {
    return (
      <LogList
        coverage={logsQuery.data?.coverage}
        isError={logsQuery.isError}
        isLoading={logsQuery.isLoading}
        logs={logsQuery.data?.entries ?? []}
        story={story}
      />
    );
  }

  const context = buildExecutionContext(story, node);
  return (
    <OperationsDocument
      context={context}
      executionOperations={executionOperationsQuery.data ?? []}
      error={executionOperationsQuery.error ?? storyOperationsQuery.error}
      isError={executionOperationsQuery.isError || storyOperationsQuery.isError}
      isLoading={
        executionOperationsQuery.isLoading || storyOperationsQuery.isLoading
      }
      node={node}
      story={story}
      storyOperations={storyOperationsQuery.data ?? []}
    />
  );
}

function EventsDocument({
  activity,
  failures,
  node,
}: {
  activity: ExecutionActivityItem[];
  failures: ReturnType<typeof buildExecutionFailures>;
  node: ExecutionNode;
}) {
  return (
    <div {...stylex.props([localStyles.utilityMinWFull])}>
      <InspectorDocumentToolbar
        bordered={false}
        count={`${activity.length} events`}
        title="Activity"
      />
      <ActivityList activity={activity} />
      <CompletionEvidence activity={activity} node={node} />
      {failures.length > 0 ? (
        <>
          <InspectorDocumentToolbar
            count={`${failures.length} items`}
            title="Failure evidence"
          />
          <FailurePanel failures={failures} node={node} />
        </>
      ) : null}
    </div>
  );
}

function OperationsDocument({
  context,
  error,
  executionOperations,
  isError,
  isLoading,
  node,
  story,
  storyOperations,
}: {
  context: ReturnType<typeof buildExecutionContext>;
  executionOperations: TechnicalOperation[];
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  node: ExecutionNode;
  story: RuntimeStory;
  storyOperations: TechnicalOperation[];
}) {
  const operationCount = technicalOperationCount({
    executionOperations,
    selectedNodeId: node.id,
    storyOperations,
    storyTimestamp: story.timestamp,
  });
  return (
    <div {...stylex.props([localStyles.utilityMinWFull])}>
      <InspectorDocumentToolbar
        count={`${operationCount} operations`}
        title="Technical execution"
      />
      <ExecutionContextPanel rows={context.rows} />
      <ExecutionLineagePanel
        downstream={context.downstream}
        upstream={context.upstream}
      />
      <TechnicalPanel
        executionOperations={executionOperations}
        error={error}
        isError={isError}
        isLoading={isLoading}
        node={node}
        story={story}
        storyOperations={storyOperations}
      />
      <JsonViewer
        bordered={false}
        countLabel={`${context.rows.length + 3} fields`}
        title="Execution context JSON"
        value={{ attributes: node.attributes, context: node.context }}
      />
    </div>
  );
}

function InspectorDocumentToolbar({
  bordered = true,
  count,
  title,
}: {
  bordered?: boolean;
  count: string;
  title: string;
}) {
  return (
    <div
      {...stylex.props(
        [
          localStyles.utilityFlex,
          localStyles.utilityH11,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityPx3,
          localStyles.utilityPt25,
          localStyles.utilityPb9px,
        ],
        bordered && [
          localStyles.utilityBorderB,
          localStyles.utilityBorderLineSubtle,
        ]
      )}
    >
      <span
        {...stylex.props([
          localStyles.utilityText13px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgPrimary,
        ])}
      >
        {title}
      </span>
      <span
        {...stylex.props([
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        {count}
      </span>
    </div>
  );
}

function CompletionEvidence({
  activity,
  node,
}: {
  activity: ExecutionActivityItem[];
  node: ExecutionNode;
}) {
  const stableEffect = firstString(
    node.attributes.stable_effect,
    node.attributes.stableEffect,
    node.attributes.effect_id,
    node.attributes.effectId
  );
  const completion = activity.at(-1);
  const completionId = firstString(
    node.context.completion_id,
    node.context.completionId,
    node.attributes.completion_id,
    node.attributes.completionId,
    completion?.id
  );
  const stable = node.status === "completed" || node.status === "published";

  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH348px,
        localStyles.utilityFlexCol,
        localStyles.utilityGap3,
        localStyles.utilityOverflowHidden,
        localStyles.utilityPx3,
        localStyles.utilityPy14px,
      ])}
    >
      <InspectorEyebrow>Completion evidence</InspectorEyebrow>
      <h3
        {...stylex.props([
          localStyles.utilityText13px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgPrimary,
        ])}
      >
        {stable ? "Stable effect confirmed" : "Completion evidence pending"}
      </h3>
      <InspectorEvidenceField
        label="Completion identity"
        value={completionId ?? "—"}
      />
      <InspectorEvidenceField
        label="Stable effect"
        value={stableEffect ?? "—"}
      />
      <InspectorEvidenceField
        label="Publisher"
        value={`${node.service} / ${typeLabel(node)}`}
      />
      <p
        {...stylex.props([
          localStyles.utilityText10px,
          localStyles.utilityLeading15px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        {stable
          ? "Published after the execution completed; this evidence confirms the terminal state."
          : "The execution has not published terminal evidence yet."}
      </p>
    </section>
  );
}

function InspectorEvidenceField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH11,
        localStyles.utilityFlexCol,
        localStyles.utilityGap1,
        localStyles.utilityOverflowHidden,
      ])}
    >
      <InspectorEyebrow>{label}</InspectorEyebrow>
      <span
        {...stylex.props([
          localStyles.utilityTruncate,
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        {value}
      </span>
    </div>
  );
}

function InspectorEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      {...stylex.props([
        localStyles.utilityText95px,
        localStyles.utilityFontMedium,
        localStyles.utilityUppercase,
        localStyles.utilityTextFgTertiary,
      ])}
    >
      {children}
    </span>
  );
}

function ExecutionContextPanel({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <section
      {...stylex.props([
        localStyles.utilityH210px,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityPx3,
        localStyles.utilityPy3,
      ])}
    >
      <InspectorEyebrow>Execution context</InspectorEyebrow>
      <div>
        {rows
          .filter(([key]) => key !== "related executions")
          .map(([key, value]) => (
            <div
              {...stylex.props([
                localStyles.utilityFlex,
                localStyles.utilityH8,
                localStyles.utilityItemsCenter,
                localStyles.utilityJustifyBetween,
                localStyles.utilityGap3,
                localStyles.utilityOverflowHidden,
              ])}
              key={key}
            >
              <span
                {...stylex.props([
                  localStyles.utilityShrink0,
                  localStyles.utilityText9px,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                {executionContextLabel(key)}
              </span>
              <span
                {...stylex.props([
                  localStyles.utilityMinW0,
                  localStyles.utilityTruncate,
                  localStyles.utilityTextRight,
                  localStyles.utilityFontMono,
                  localStyles.utilityText10px,
                  localStyles.utilityTextFgSecondary,
                ])}
              >
                {formatCell(value)}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

function executionContextLabel(key: string) {
  return key.endsWith(" id") ? key.slice(0, -3) : key;
}

function ExecutionLineagePanel({
  downstream,
  upstream,
}: {
  downstream: ExecutionNode[];
  upstream: ExecutionNode[];
}) {
  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH132px,
        localStyles.utilityFlexCol,
        localStyles.utilityGap6px,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityPx3,
        localStyles.utilityPy2,
      ])}
    >
      <InspectorEyebrow>Related executions</InspectorEyebrow>
      <LineageRow direction="Upstream" node={upstream.at(-1)} />
      <LineageRow direction="Downstream" node={downstream[0]} />
    </section>
  );
}

function LineageRow({
  direction,
  node,
}: {
  direction: string;
  node: ExecutionNode | undefined;
}) {
  return (
    <div
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH42px,
        localStyles.utilityItemsCenter,
        localStyles.utilityJustifyBetween,
        localStyles.utilityGap3,
        localStyles.utilityOverflowHidden,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH9,
          localStyles.utilityW220px,
          localStyles.utilityShrink0,
          localStyles.utilityFlexCol,
          localStyles.utilityGap05,
          localStyles.utilityOverflowHidden,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityText9px,
            localStyles.utilityFontMedium,
            localStyles.utilityUppercase,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          {direction}
        </span>
        <span
          {...stylex.props([
            localStyles.utilityTruncate,
            localStyles.utilityFontMono,
            localStyles.utilityText11px,
            localStyles.utilityTextFgPrimary,
          ])}
        >
          {node?.name ?? "—"}
        </span>
      </div>
      <span
        {...stylex.props([
          localStyles.utilityShrink0,
          localStyles.utilityFontMono,
          localStyles.utilityText9px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        {node ? typeLabel(node) : "—"}
      </span>
    </div>
  );
}

function OverviewDocument({
  children,
  logsCount,
  node,
  payload,
  story,
}: {
  children?: React.ReactNode;
  logsCount: number;
  node: ExecutionNode;
  payload: ExecutionPayload | undefined;
  story: RuntimeStory;
}) {
  const context = buildExecutionContext(story, node);
  const parent = context.upstream.at(-1);
  const [child] = context.downstream;
  const signal = executionSignal(node);
  const stableEffect = firstString(
    node.attributes.stable_effect,
    node.attributes.stableEffect,
    node.attributes.effect_id,
    node.attributes.effectId
  );
  const traceId = firstString(
    node.context.trace_id,
    node.context.traceId,
    node.attributes.trace_id,
    node.attributes.traceId
  );
  const payloadCount = [
    payload?.input,
    payload?.output,
    payload?.metadata,
  ].filter(hasPanelValue).length;
  const attempt = `${node.attempts ?? 1} / ${node.maxAttempts ?? 1}`;
  const properties: Array<
    | { label: string; value: string }
    | { left: [string, string]; right: [string, string] }
  > = [
    { label: "canonical name", value: node.canonicalName ?? node.name },
    { label: "stable effect", value: stableEffect ?? "—" },
    {
      left: ["service", node.service],
      right: ["kind", typeLabel(node)],
    },
    {
      left: ["started", inspectorClock(story, node.startMs)],
      right: [
        "completed",
        inspectorClock(story, node.startMs + node.durationMs),
      ],
    },
    {
      left: ["status", node.status],
      right: ["attempt", attempt],
    },
    {
      left: ["parent", parent?.name ?? "—"],
      right: ["children", String(context.downstream.length)],
    },
  ];

  return (
    <div
      {...stylex.props([
        localStyles.utilityMinWFull,
        localStyles.utilityTextXs,
      ])}
    >
      <section
        {...stylex.props([
          localStyles.utilityH98px,
          localStyles.utilityBorderB,
          localStyles.utilityBorderLineSubtle,
          localStyles.utilityPx3,
          localStyles.utilityPt11px,
          localStyles.utilityPb25,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH4,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityText95px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          <span>Execution</span>
          <span
            {...stylex.props(
              styles.statusText(statusColorForInspector(node.status))
            )}
          >
            {statusLabel(node.status)}
          </span>
        </div>
        <h3
          {...stylex.props([
            localStyles.utilityMt15,
            localStyles.utilityTruncate,
            localStyles.utilityText13px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgPrimary,
          ])}
        >
          {signal.title}
        </h3>
        <p
          {...stylex.props([
            localStyles.utilityMt1,
            localStyles.utilityMaxWFull,
            localStyles.utilityText10px,
            localStyles.utilityLeading15px,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          {signal.description}
        </p>
      </section>

      <section
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityH58px,
          localStyles.utilityGridCols3,
          localStyles.utilityGap4,
          localStyles.utilityBorderB,
          localStyles.utilityBorderLineSubtle,
          localStyles.utilityPx3,
          localStyles.utilityPy25,
        ])}
      >
        <InspectorMetric
          accent
          label="Duration"
          value={formatRuntimeDuration(node.durationMs)}
        />
        <InspectorMetric label="Attempt" value={attempt} />
        <InspectorMetric
          label="Children"
          value={String(context.downstream.length)}
        />
      </section>

      <ExecutionRoute
        child={child}
        node={node}
        parent={parent}
        stable={Boolean(stableEffect) || node.status === "completed"}
      />

      <section>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH30px,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityPx3,
            localStyles.utilityText95px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          <span>Properties</span>
          <button
            {...stylex.props([
              localStyles.utilityInlineFlex,
              localStyles.utilityItemsCenter,
              localStyles.utilityGap1,
              localStyles.utilityText95px,
              localStyles.utilityFontMedium,
              localStyles.utilityTextFgSecondary,
              localStyles.utilityHoverTextFgPrimary,
            ])}
            type="button"
          >
            <Copy size={12} />
            Copy all
          </button>
        </div>
        {properties.map((property, index) =>
          "label" in property ? (
            <div
              {...stylex.props(
                [
                  localStyles.utilityGrid,
                  localStyles.utilityH9,
                  localStyles.utilityGridCols92pxMinmax01fr,
                  localStyles.utilityItemsCenter,
                  localStyles.utilityPx3,
                  localStyles.utilityFontMono,
                ],
                index === properties.length - 1 && [
                  localStyles.utilityBorderB,
                  localStyles.utilityBorderLineSubtle,
                ]
              )}
              key={property.label}
            >
              <span
                {...stylex.props([
                  localStyles.utilityText9px,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                {property.label}
              </span>
              <span
                {...stylex.props([
                  localStyles.utilityTruncate,
                  localStyles.utilityText95px,
                  localStyles.utilityTextFgPrimary,
                ])}
              >
                {property.value}
              </span>
            </div>
          ) : (
            <div
              {...stylex.props(
                [
                  localStyles.utilityGrid,
                  localStyles.utilityH9,
                  localStyles.utilityGridCols60px102px62pxMinmax01fr,
                  localStyles.utilityItemsCenter,
                  localStyles.utilityPx3,
                  localStyles.utilityFontMono,
                ],
                index === properties.length - 1 && [
                  localStyles.utilityBorderB,
                  localStyles.utilityBorderLineSubtle,
                ]
              )}
              key={`${property.left[0]}-${index}`}
            >
              <span
                {...stylex.props([
                  localStyles.utilityText9px,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                {property.left[0]}
              </span>
              <span
                {...stylex.props([
                  localStyles.utilityTruncate,
                  localStyles.utilityText95px,
                  localStyles.utilityTextFgPrimary,
                ])}
                {...(property.left[0] === "status"
                  ? stylex.props(
                      styles.statusText(statusColorForInspector(node.status))
                    )
                  : {})}
              >
                {property.left[1]}
              </span>
              <span
                {...stylex.props([
                  localStyles.utilityText9px,
                  localStyles.utilityTextFgTertiary,
                ])}
              >
                {property.right[0]}
              </span>
              <span
                {...stylex.props([
                  localStyles.utilityTruncate,
                  localStyles.utilityText95px,
                  localStyles.utilityTextFgPrimary,
                ])}
              >
                {property.right[1]}
              </span>
            </div>
          )
        )}
      </section>

      <section>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH30px,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityPx3,
            localStyles.utilityText95px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          <span>Evidence</span>
          <span
            {...stylex.props([
              localStyles.utilityFontMono,
              localStyles.utilityText85px,
              localStyles.utilityFontNormal,
            ])}
          >
            {Number(payloadCount > 0) + Number(logsCount > 0)} sources
          </span>
        </div>
        <EvidenceRow
          count={payloadCount}
          description="request + response"
          label="Payload"
        />
        <EvidenceRow
          count={logsCount}
          description="structured entries"
          label="Logs"
          muted
        />
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH30px,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityPx3,
            localStyles.utilityText95px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          <span>Trace context</span>
          <span
            {...stylex.props([
              localStyles.utilityFontMono,
              localStyles.utilityText85px,
              localStyles.utilityFontNormal,
            ])}
          >
            2 fields
          </span>
        </div>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH60px,
            localStyles.utilityFlexCol,
            localStyles.utilityOverflowHidden,
            localStyles.utilityFontMono,
          ])}
        >
          <div
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityH30px,
              localStyles.utilityShrink0,
              localStyles.utilityItemsCenter,
              localStyles.utilityOverflowHidden,
              localStyles.utilityPx3,
            ])}
          >
            <span
              {...stylex.props([
                localStyles.utilityW92px,
                localStyles.utilityShrink0,
                localStyles.utilityText85px,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              trace
            </span>
            <span
              {...stylex.props([
                localStyles.utilityTruncate,
                localStyles.utilityText9px,
                localStyles.utilityTextFgSecondary,
              ])}
            >
              {traceId ?? "—"}
            </span>
          </div>
          <div
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityH30px,
              localStyles.utilityShrink0,
              localStyles.utilityItemsCenter,
              localStyles.utilityOverflowHidden,
              localStyles.utilityPx3,
            ])}
          >
            <span
              {...stylex.props([
                localStyles.utilityW92px,
                localStyles.utilityShrink0,
                localStyles.utilityText85px,
                localStyles.utilityTextFgTertiary,
              ])}
            >
              correlation
            </span>
            <span
              {...stylex.props([
                localStyles.utilityTruncate,
                localStyles.utilityText9px,
                localStyles.utilityTextFgSecondary,
              ])}
            >
              {story.correlationId}
            </span>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

function InspectorMetric({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div {...stylex.props([localStyles.utilityMinW0])}>
      <div
        {...stylex.props(
          [
            localStyles.utilityTruncate,
            localStyles.utilityFontMono,
            localStyles.utilityText13px,
            localStyles.utilityLeading17px,
            localStyles.utilityTextFgPrimary,
          ],
          accent && [localStyles.utilityTextToneSuccessFg]
        )}
      >
        {value}
      </div>
      <div
        {...stylex.props([
          localStyles.utilityMt3px,
          localStyles.utilityText9px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        {label}
      </div>
    </div>
  );
}

function ExecutionRoute({
  child,
  node,
  parent,
  stable,
}: {
  child: ExecutionNode | undefined;
  node: ExecutionNode;
  parent: ExecutionNode | undefined;
  stable: boolean;
}) {
  const route = [parent, node, child];
  return (
    <section
      {...stylex.props([
        localStyles.utilityRelative,
        localStyles.utilityH122px,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityPx3,
          localStyles.utilityPt25,
          localStyles.utilityText95px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <span>Execution route</span>
        <span
          {...stylex.props([
            localStyles.utilityFontMono,
            localStyles.utilityText85px,
            localStyles.utilityFontNormal,
          ])}
        >
          {parent ? 1 : 0} upstream&nbsp; · &nbsp;{child ? 1 : 0} downstream
        </span>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityTop60px,
          localStyles.utilityRight7,
          localStyles.utilityLeft7,
          localStyles.utilityHPx,
          localStyles.utilityBgLineSubtle,
        ])}
      />
      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityTop37px,
          localStyles.utilityRight3,
          localStyles.utilityLeft3,
          localStyles.utilityGrid,
          localStyles.utilityGridCols3,
        ])}
      >
        {route.map((item, index) => {
          const selected = index === 1;
          return (
            <div
              {...stylex.props([
                localStyles.utilityMinW0,
                localStyles.utilityTextCenter,
              ])}
              key={item?.id ?? index}
            >
              <div
                {...stylex.props(
                  [
                    localStyles.utilityTruncate,
                    localStyles.utilityPx1,
                    localStyles.utilityText10px,
                    localStyles.utilityTextFgSecondary,
                  ],
                  selected && [
                    localStyles.utilityFontMedium,
                    localStyles.utilityTextFgPrimary,
                  ]
                )}
                title={item?.name}
              >
                {item?.name ?? "—"}
              </div>
              <span
                {...stylex.props(
                  [
                    localStyles.utilityMxAuto,
                    localStyles.utilityMt3,
                    localStyles.utilityBlock,
                    localStyles.utilitySize15,
                    localStyles.utilityRoundedFull,
                    localStyles.utilityBgFgTertiary,
                  ],
                  selected && [
                    localStyles.utilitySize2,
                    localStyles.utilityTranslateYPx,
                    localStyles.utilityBgToneSuccessFg,
                  ]
                )}
              />
              <div
                {...stylex.props(
                  [
                    localStyles.utilityMt2,
                    localStyles.utilityTruncate,
                    localStyles.utilityPx1,
                    localStyles.utilityFontMono,
                    localStyles.utilityText85px,
                    localStyles.utilityTextFgTertiary,
                  ],
                  selected && [
                    localStyles.utilityFontSans,
                    localStyles.utilityText9px,
                    localStyles.utilityFontMedium,
                    localStyles.utilityTextToneSuccessFg,
                  ]
                )}
              >
                {selected
                  ? `${node.service} · selected`
                  : item
                    ? `${item.service} · ${index === 0 ? formatRuntimeDuration(item.durationMs) : "next"}`
                    : "—"}
              </div>
            </div>
          );
        })}
      </div>
      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityRight3,
          localStyles.utilityBottom3,
          localStyles.utilityLeft3,
          localStyles.utilityTruncate,
          localStyles.utilityFontMono,
          localStyles.utilityText9px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        {stable
          ? "selected effect is stable; completion evidence received"
          : "selected execution is awaiting stable completion evidence"}
      </div>
    </section>
  );
}

function EvidenceRow({
  count,
  description,
  label,
  muted = false,
}: {
  count: number;
  description: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <div
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH9,
        localStyles.utilityItemsCenter,
        localStyles.utilityGap2,
        localStyles.utilityPx3,
      ])}
    >
      <span
        {...stylex.props(
          [
            localStyles.utilitySize5px,
            localStyles.utilityShrink0,
            localStyles.utilityBgAccent,
          ],
          muted && [localStyles.utilityBgFgTertiary]
        )}
      />
      <span
        {...stylex.props([
          localStyles.utilityText10px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgPrimary,
        ])}
      >
        {label}
      </span>
      <span
        {...stylex.props([
          localStyles.utilityFontMono,
          localStyles.utilityText9px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        {description}
      </span>
      <span
        {...stylex.props([
          localStyles.utilityMlAuto,
          localStyles.utilityFontMono,
          localStyles.utilityText9px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        {count}
      </span>
    </div>
  );
}

function executionSignal(node: ExecutionNode) {
  const title = `${node.name} ${statusLabel(node.status).toLowerCase()}`;
  const description =
    node.status === "failed" || node.status === "dead"
      ? `Execution stopped in ${node.service}; failure evidence is available for operator review.`
      : `Recorded by ${node.service} after ${formatRuntimeDuration(node.durationMs)} with its execution evidence attached.`;
  return { description, title };
}

function buildInspectorPath(story: RuntimeStory, node: ExecutionNode) {
  return buildBreadcrumb(story, node)
    .map((item) => item.name)
    .join("  →  ");
}

function statusColorForInspector(status: ExecutionNode["status"]) {
  if (status === "failed" || status === "dead") {
    return "var(--tone-error-fg)";
  }
  if (status === "pending" || status === "processing" || status === "running") {
    return "var(--tone-warning-fg)";
  }
  return "var(--tone-success-fg)";
}

function statusLabel(status: ExecutionNode["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

function inspectorClock(story: RuntimeStory, offsetMs: number) {
  const startedAt = Date.parse(story.timestamp);
  if (!Number.isFinite(startedAt)) {
    return formatRuntimeDuration(offsetMs);
  }
  const date = new Date(startedAt + offsetMs);
  return `${date.toISOString().slice(11, 19)}.${String(date.getUTCMilliseconds()).padStart(3, "0")}`;
}

function ProviderCallDetail({
  detail,
  onOpenRemoteCalls,
}: {
  detail: ReturnType<typeof buildProviderCallInspectorDetail>;
  onOpenRemoteCalls: () => void;
}) {
  if (!detail) {
    return null;
  }

  return (
    <section
      {...stylex.props([
        localStyles.utilityGrid,
        localStyles.utilityMinWFull,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLine,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap2,
          localStyles.utilityBgBgPanelHeader,
          localStyles.utilityPx3,
          localStyles.utilityPy15,
          localStyles.utilityText11px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          Provider call
        </span>
        <button
          {...stylex.props([
            localStyles.utilityMlAuto,
            localStyles.utilityInlineFlex,
            localStyles.utilityH5,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap1,
            localStyles.utilityBorder,
            localStyles.utilityBorderLine,
            localStyles.utilityBgBgControl,
            localStyles.utilityPx15,
            localStyles.utilityText10px,
            localStyles.utilityTextFgSecondary,
            localStyles.utilityHoverTextFgPrimary,
          ])}
          onClick={onOpenRemoteCalls}
          type="button"
        >
          <Network size={11} />
          Remote Calls
        </button>
      </div>
      <KeyValueTable rows={detail.rows} />
      {hasPanelValue(detail.pathParams) ? (
        <JsonViewer title="path params" value={detail.pathParams} />
      ) : null}
      {hasPanelValue(detail.errorDetails) ? (
        <JsonViewer title="error details" value={detail.errorDetails} />
      ) : null}
    </section>
  );
}

function TechnicalPanel({
  executionOperations,
  error,
  isError,
  isLoading,
  node,
  story,
  storyOperations,
}: {
  executionOperations: TechnicalOperation[];
  storyOperations: TechnicalOperation[];
  story: RuntimeStory;
  node: ExecutionNode;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const groups = buildTechnicalOperationGroups({
    executionOperations,
    selectedNodeId: node.id,
    storyOperations,
    storyTimestamp: story.timestamp,
  });
  if (groups.length === 0 || isLoading || isError) {
    return (
      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityMinWFull,
        ])}
      >
        <EmptyRows
          label={technicalOperationsStateLabel({ error, isError, isLoading })}
        />
      </div>
    );
  }

  return (
    <div
      {...stylex.props([localStyles.utilityGrid, localStyles.utilityMinWFull])}
    >
      {groups.map((group) => (
        <TechnicalOperationGroupView group={group} key={group.id} />
      ))}
    </div>
  );
}

function TechnicalOperationGroupView({
  group,
}: {
  group: TechnicalOperationGroup;
}) {
  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH278px,
        localStyles.utilityFlexCol,
        localStyles.utilityGap2,
        localStyles.utilityOverflowVisible,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityP3,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH26px,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityOverflowHidden,
          localStyles.utilityText10px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityFontMedium,
            localStyles.utilityUppercase,
          ])}
        >
          {group.label.replaceAll("-", " ")}
        </span>
        <span
          {...stylex.props([
            localStyles.utilityFontMono,
            localStyles.utilityText9px,
          ])}
        >
          {group.operations.length}
        </span>
      </div>
      {group.operations.map((operation, index) => (
        <TechnicalOperationRow
          index={index}
          operation={operation}
          key={operation.id}
        />
      ))}
    </section>
  );
}

function TechnicalOperationRow({
  index,
  operation,
}: {
  index: number;
  operation: TechnicalOperationView;
}) {
  const { openRemoteCalls } = useConsole();
  const operationsTarget = technicalOperationOperationsTarget(operation);
  const [attributesVisible, setAttributesVisible] = useState(false);
  return (
    <div
      {...stylex.props([
        localStyles.utilityRelative,
        localStyles.utilityFlex,
        localStyles.utilityH84px,
        localStyles.utilityShrink0,
        localStyles.utilityGap25,
        localStyles.utilityOverflowVisible,
        localStyles.utilityPy2,
      ])}
      {...stylex.props(stylex.defaultMarker())}
    >
      <span
        {...stylex.props([
          localStyles.utilityW13px,
          localStyles.utilityShrink0,
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextAccent,
        ])}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH68px,
          localStyles.utilityW256px,
          localStyles.utilityShrink0,
          localStyles.utilityFlexCol,
          localStyles.utilityGap5px,
          localStyles.utilityOverflowHidden,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH18px,
            localStyles.utilityItemsStart,
            localStyles.utilityJustifyBetween,
            localStyles.utilityGap2,
          ])}
        >
          <span
            {...stylex.props([
              localStyles.utilityTruncate,
              localStyles.utilityFontMono,
              localStyles.utilityText11px,
              localStyles.utilityFontMedium,
              localStyles.utilityTextFgPrimary,
            ])}
            title={operation.name}
          >
            {operation.name}
          </span>
          <span
            {...stylex.props([
              localStyles.utilityShrink0,
              localStyles.utilityFontMono,
              localStyles.utilityText10px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {formatRuntimeDuration(operation.durationMs)}
          </span>
        </div>
        <div
          {...stylex.props(
            [
              localStyles.utilityFontMono,
              localStyles.utilityText9px,
              localStyles.utilityFontMedium,
              localStyles.utilityUppercase,
            ],
            operation.status === "error"
              ? [localStyles.utilityTextToneErrorFg]
              : [localStyles.utilityTextToneSuccessFg]
          )}
        >
          {operation.status}
        </div>
        <div
          {...stylex.props([
            localStyles.utilityTruncate,
            localStyles.utilityText10px,
            localStyles.utilityTextFgSecondary,
          ])}
          title={operation.summary}
        >
          {operation.summary ?? operation.sourceLabel}
        </div>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityAbsolute,
          localStyles.utilityTop2,
          localStyles.utilityRight0,
          localStyles.utilityFlex,
          localStyles.utilityItemsStart,
        ])}
      >
        {Object.keys(operation.safeAttributes).length > 0 ? (
          <button
            aria-expanded={attributesVisible}
            aria-label={`Toggle ${operation.name} safe attributes`}
            {...stylex.props([
              localStyles.utilityMr1,
              localStyles.utilityGrid,
              localStyles.utilitySize4,
              localStyles.utilityPlaceItemsCenter,
              localStyles.utilityTextFgTertiary,
              localStyles.utilityTransitionOpacity,
            ])}
            {...stylex.props(styles.technicalOperationAttributeToggle)}
            onClick={() => setAttributesVisible((current) => !current)}
            title="Show safe attributes"
            type="button"
          >
            <Copy size={10} />
          </button>
        ) : null}
        {operationsTarget ? (
          <button
            aria-label={`Open ${operation.sourceLabel} operations`}
            {...stylex.props([
              localStyles.utilityGrid,
              localStyles.utilitySize4,
              localStyles.utilityPlaceItemsCenter,
              localStyles.utilityTextFgTertiary,
              localStyles.utilityHoverTextFgPrimary,
            ])}
            onClick={() =>
              openRemoteCalls(
                operationsTarget.correlationId,
                operationsTarget.selectedId
              )
            }
            title={`Open ${operation.sourceLabel} operations`}
            type="button"
          >
            <ExternalLink size={11} />
          </button>
        ) : (
          <span />
        )}
      </div>
      {attributesVisible ? (
        <JsonViewer
          defaultExpanded
          stylex={[
            localStyles.utilityAbsolute,
            localStyles.utilityTopFull,
            localStyles.utilityRight0,
            localStyles.utilityLeft0,
            localStyles.utilityZ10,
          ]}
          title="safe attributes"
          value={operation.safeAttributes}
        />
      ) : null}
    </div>
  );
}

function KeyValueTable({ rows }: { rows: Array<[string, unknown]> }) {
  if (rows.length === 0) {
    return <EmptyRows label="No execution details recorded" />;
  }

  return (
    <div
      {...stylex.props([
        localStyles.utilityMinWFull,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityTextXs,
      ])}
    >
      {rows.map(([key, value]) => (
        <div
          {...stylex.props([
            localStyles.utilityGrid,
            localStyles.utilityMinH9,
            localStyles.utilityMinWFull,
            localStyles.utilityGridCols92pxMinmax01fr,
            localStyles.utilityBorderB,
            localStyles.utilityBorderLineSubtle,
            localStyles.utilityLastBorderB0,
          ])}
          key={key}
        >
          <div
            {...stylex.props([
              localStyles.utilityPx3,
              localStyles.utilityPy2,
              localStyles.utilityText9px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {key}
          </div>
          <div
            {...stylex.props([
              localStyles.utilityWhitespacePreWrap,
              localStyles.utilityPx3,
              localStyles.utilityPy2,
              localStyles.utilityFontMono,
              localStyles.utilityText10px,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            {formatCell(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ activity }: { activity: ExecutionActivityItem[] }) {
  if (activity.length === 0) {
    return <EmptyRows label="No activity recorded" />;
  }
  return (
    <div {...stylex.props([localStyles.utilityMinWFull])}>
      {activity.map((item, index) => (
        <EventActivityRow
          isLast={index === activity.length - 1}
          item={item}
          key={item.id}
        />
      ))}
    </div>
  );
}

function EventActivityRow({
  isLast,
  item,
}: {
  isLast: boolean;
  item: ExecutionActivityItem;
}) {
  const eventKind = eventKindLabel(item);
  const detailLines = [item.detail ?? item.label, `source · ${item.kind}`];

  return (
    <div
      {...stylex.props(
        [
          localStyles.utilityFlex,
          localStyles.utilityH108px,
          localStyles.utilityWFull,
          localStyles.utilityGap3,
          localStyles.utilityOverflowHidden,
          localStyles.utilityPx3,
        ],
        isLast && [
          localStyles.utilityBorderB,
          localStyles.utilityBorderLineSubtle,
        ]
      )}
    >
      <div
        {...stylex.props([
          localStyles.utilityRelative,
          localStyles.utilityH108px,
          localStyles.utilityW3,
          localStyles.utilityShrink0,
        ])}
      >
        <span
          {...stylex.props(
            [
              localStyles.utilityAbsolute,
              localStyles.utilityTop0,
              localStyles.utilityLeft12,
              localStyles.utilitySize2,
              localStyles.utilityTranslateX12,
              localStyles.utilityRoundedFull,
            ],
            isLast
              ? [localStyles.utilityBgFgPrimary]
              : [localStyles.utilityBgToneSuccessFg]
          )}
        />
        {isLast ? null : (
          <span
            {...stylex.props([
              localStyles.utilityAbsolute,
              localStyles.utilityTop2,
              localStyles.utilityBottom2,
              localStyles.utilityLeft12,
              localStyles.utilityWPx,
              localStyles.utilityTranslateX12,
              localStyles.utilityBgLineSubtle,
            ])}
          />
        )}
      </div>
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH108px,
          localStyles.utilityW284px,
          localStyles.utilityShrink0,
          localStyles.utilityFlexCol,
          localStyles.utilityGap7px,
          localStyles.utilityPt0,
        ])}
      >
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH18px,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityGap2,
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
          ])}
        >
          <span {...stylex.props([localStyles.utilityTextFgTertiary])}>
            +{formatRuntimeDuration(item.timestampMs)}
          </span>
          <span
            {...stylex.props(
              localStyles.utilityFontMedium,
              styles.statusText(activityStatusColor(item.status))
            )}
          >
            {eventKind} · {item.status.toUpperCase()}
          </span>
        </div>
        <div
          {...stylex.props([
            localStyles.utilityTruncate,
            localStyles.utilityText12px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgPrimary,
          ])}
        >
          {item.label}
        </div>
        <div
          {...stylex.props([
            localStyles.utilityH9,
            localStyles.utilityOverflowHidden,
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
            localStyles.utilityLeading0,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          {detailLines.map((line) => (
            <div
              {...stylex.props([
                localStyles.utilityTruncate,
                localStyles.utilityLeadingNormal,
              ])}
              key={line}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function eventKindLabel(item: ExecutionActivityItem) {
  if (item.kind === "event") {
    return "EVENT";
  }
  if (item.kind.includes("function")) {
    return "DATABASE";
  }
  if (item.kind.includes("http") || item.kind.includes("command")) {
    return "COMMAND";
  }
  return item.kind.toUpperCase();
}

function activityStatusColor(status: string) {
  if (status === "failed" || status === "dead" || status === "error") {
    return "var(--tone-error-fg)";
  }
  if (status === "pending" || status === "processing" || status === "running") {
    return "var(--tone-warning-fg)";
  }
  return "var(--tone-success-fg)";
}

function FailurePanel({
  failures,
  node,
}: {
  failures: ReturnType<typeof buildExecutionFailures>;
  node: ExecutionNode;
}) {
  if (failures.length === 0) {
    return <EmptyRows label="No failures recorded" />;
  }

  return (
    <div
      {...stylex.props([localStyles.utilityGrid, localStyles.utilityMinWFull])}
    >
      <KeyValueTable rows={failures.map((item) => [item.label, item.value])} />
      <KeyValueTable
        rows={[
          ["dead letter state", node.status === "dead" ? "dead" : "-"],
          ["retryability", node.retryable ? "retryable" : "not retryable"],
          ["failure timeline", node.logs.join("\n") || "-"],
        ]}
      />
    </div>
  );
}

function PayloadDocument({
  error,
  isError,
  isLoading,
  node,
  payload,
}: {
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  node: ExecutionNode;
  payload: ExecutionPayload | undefined;
}) {
  if (isLoading) {
    return <EmptyRows label="Loading captured execution payload..." />;
  }
  if (isError) {
    return (
      <EmptyRows
        label={`Execution payload could not be loaded. ${errorMessage(error)}`}
      />
    );
  }

  const sections = [
    ["input", payload?.input],
    ["output", payload?.output],
    ["metadata", payload?.metadata],
  ] as const;
  if (!sections.some(([, value]) => hasPanelValue(value))) {
    return (
      <EmptyRows label="No payload or metadata was captured for this execution." />
    );
  }

  return (
    <div
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityMinHFull,
        localStyles.utilityMinWFull,
        localStyles.utilityFlexCol,
      ])}
    >
      {payload && payload.redactedFields.length > 0 ? (
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH11,
            localStyles.utilityShrink0,
            localStyles.utilityGap2,
            localStyles.utilityOverflowHidden,
            localStyles.utilityBorderB,
            localStyles.utilityBorderLineSubtle,
            localStyles.utilityPx3,
            localStyles.utilityPy7px,
          ])}
        >
          <span
            {...stylex.props([
              localStyles.utilityW7px,
              localStyles.utilityShrink0,
              localStyles.utilityText13px,
              localStyles.utilityLeading17px,
              localStyles.utilityFontMedium,
              localStyles.utilityTextToneWarningFg,
            ])}
          >
            ✦
          </span>
          <div
            {...stylex.props([
              localStyles.utilityH30px,
              localStyles.utilityW260px,
              localStyles.utilityText10px,
              localStyles.utilityLeading15px,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            <div>
              {payload.redactedFields.length} sensitive field
              {payload.redactedFields.length === 1 ? "" : "s"} redacted
            </div>
            <div>{payload.redactedFields.join(" · ")}</div>
          </div>
        </div>
      ) : null}
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH44px,
          localStyles.utilityShrink0,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityBorderB,
          localStyles.utilityBorderLineSubtle,
          localStyles.utilityPx3,
          localStyles.utilityPt25,
          localStyles.utilityPb9px,
          localStyles.utilityLeadingNormal2,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityText13px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgPrimary,
          ])}
        >
          Request payload
        </span>
        <span
          {...stylex.props([
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          application/json
        </span>
      </div>
      {hasPanelValue(payload?.input) ? (
        <PayloadJsonBlock
          countLabel={`${fieldCount(payload?.input)} fields`}
          title="input"
          value={payload?.input}
        />
      ) : null}
      {payload && hasPanelValue(payload.output) ? (
        <JsonViewer
          countLabel={`${fieldCount(payload.output)} fields`}
          title="output"
          value={payload.output}
          variant="payload-row"
        />
      ) : null}
      {payload && hasPanelValue(payload.metadata) ? (
        <JsonViewer
          countLabel={`${fieldCount(payload.metadata)} fields`}
          title="metadata"
          value={payload.metadata}
          variant="payload-row"
        />
      ) : null}
      <div
        {...stylex.props([localStyles.utilityMinH0, localStyles.utilityFlex1])}
      />
      <PayloadContract node={node} payload={payload} />
    </div>
  );
}

function PayloadJsonBlock({
  countLabel,
  title,
  value,
}: {
  countLabel: string;
  title: string;
  value: unknown;
}) {
  const [expanded, setExpanded] = useState(true);
  const json = prettyJson(value);

  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityShrink0,
        localStyles.utilityFlexCol,
        localStyles.utilityOverflowHidden,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH52px,
          localStyles.utilityShrink0,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityBorderB,
          localStyles.utilityBorderLineSubtle,
          localStyles.utilityPx3,
          localStyles.utilityPt25,
          localStyles.utilityPb9px,
        ])}
      >
        <button
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityMinW0,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap2,
            localStyles.utilityTextLeft,
          ])}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? (
            <ChevronDown
              {...stylex.props([
                localStyles.utilitySize3,
                localStyles.utilityShrink0,
                localStyles.utilityTextFgTertiary,
              ])}
            />
          ) : (
            <ChevronRight
              {...stylex.props([
                localStyles.utilitySize3,
                localStyles.utilityShrink0,
                localStyles.utilityTextFgTertiary,
              ])}
            />
          )}
          <span
            {...stylex.props([
              localStyles.utilityFontSans,
              localStyles.utilityText11px,
              localStyles.utilityFontMedium,
              localStyles.utilityTextFgPrimary,
            ])}
          >
            {title}
          </span>
        </button>
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityItemsCenter,
            localStyles.utilityGap4,
            localStyles.utilityWhitespaceNowrap,
            localStyles.utilityText10px,
          ])}
        >
          <span
            {...stylex.props([
              localStyles.utilityFontMono,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {countLabel}
          </span>
          <button
            {...stylex.props([
              localStyles.utilityFontMedium,
              localStyles.utilityTextFgSecondary,
              localStyles.utilityHoverTextFgPrimary,
            ])}
            type="button"
          >
            Copy
          </button>
        </div>
      </div>
      {expanded ? (
        <div
          {...stylex.props([
            localStyles.utilityMaxH171px,
            localStyles.utilityShrink0,
            localStyles.utilityOverflowHidden,
            localStyles.utilityBorderB,
            localStyles.utilityBorderLineSubtle,
            localStyles.utilityPx3,
            localStyles.utilityPt25,
            localStyles.utilityPb11px,
          ])}
        >
          <pre
            {...stylex.props([
              localStyles.utilityMaxH150px,
              localStyles.utilityOverflowAuto,
              localStyles.utilityWhitespacePreWrap,
              localStyles.utilityFontMono,
              localStyles.utilityText11px,
              localStyles.utilityLeading15px,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            {json}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function PayloadContract({
  node,
  payload,
}: {
  node: ExecutionNode;
  payload: ExecutionPayload | undefined;
}) {
  const contract =
    firstString(
      node.attributes.payload_contract,
      node.attributes.payloadContract,
      node.attributes.input_schema,
      node.attributes.inputSchema
    ) ?? `${node.canonicalName ?? node.name} / v1`;
  const isValid = Boolean(payload) && !payload?.redactedFields.length;

  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH80px,
        localStyles.utilityShrink0,
        localStyles.utilityFlexCol,
        localStyles.utilityJustifyCenter,
        localStyles.utilityGap2,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBorderT,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityP3,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH4,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityFontMedium,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityW97px,
            localStyles.utilityShrink0,
          ])}
        >
          <InspectorEyebrow>Payload contract</InspectorEyebrow>
        </span>
        <p
          {...stylex.props([
            localStyles.utilityWhitespaceNowrap,
            localStyles.utilityFontMono,
            localStyles.utilityText12px,
            localStyles.utilityFontMedium,
            localStyles.utilityTextFgPrimary,
          ])}
        >
          {contract}
        </p>
      </div>
      <p
        {...stylex.props(
          [localStyles.utilityText11px],
          isValid
            ? [localStyles.utilityTextToneSuccessFg]
            : [localStyles.utilityTextFgSecondary]
        )}
      >
        {isValid
          ? "Validated at ingress · 0 schema errors"
          : "Validation evidence is incomplete"}
      </p>
    </section>
  );
}

export function LogList({
  coverage,
  isError,
  isLoading,
  logs,
  story,
}: {
  story: RuntimeStory;
  coverage: ExecutionLogCoverage | undefined;
  logs: ExecutionLogEntry[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <EmptyRows label="Loading execution logs..." />;
  }
  if (isError) {
    return <EmptyRows label="Execution logs could not be loaded." />;
  }
  const presentation = executionLogPresentation({
    coverage,
    entryCount: logs.length,
  });
  const coverageContext = executionLogCoverageContext(coverage);
  if (logs.length === 0) {
    return (
      <div>
        <EmptyRows
          label={presentation.emptyLabel ?? "No runtime logs recorded"}
        />
        <LogCoverageContext context={coverageContext} />
      </div>
    );
  }
  return (
    <div {...stylex.props([localStyles.utilityMinWFull])}>
      {presentation.noticeLabel ? (
        <output
          {...stylex.props([
            localStyles.utilityBlock,
            localStyles.utilityBorderB,
            localStyles.utilityBorderLineSubtle,
            localStyles.utilityPx3,
            localStyles.utilityPy2,
            localStyles.utilityFontMono,
            localStyles.utilityText10px,
            localStyles.utilityTextToneWarningFg,
          ])}
        >
          {presentation.noticeLabel}
        </output>
      ) : null}
      <LogCoverageContext context={coverageContext} />
      <InspectorDocumentToolbar
        count={`${logs.length} entries`}
        title="Runtime logs"
      />
      {logs.map((log) => (
        <LogEntry key={log.id} log={log} story={story} />
      ))}
      {logs.some(logHasAttributes) ? (
        <LogAttributesPanel
          log={logs.toReversed().find(logHasAttributes) ?? logs.at(-1)!}
        />
      ) : null}
      <LogDiagnostic logs={logs} />
    </div>
  );
}

function LogCoverageContext({
  context,
}: {
  context:
    | {
        gapContexts: Array<{
          detailLabel: string;
          nextActionLabel?: string;
          sourceId: string;
        }>;
        sourceSummaryLabel?: string;
      }
    | undefined;
}) {
  if (!context) {
    return null;
  }

  return (
    <div
      {...stylex.props([
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityPx3,
        localStyles.utilityPy2,
        localStyles.utilityText10px,
        localStyles.utilityLeading15px,
        localStyles.utilityTextFgSecondary,
      ])}
    >
      {context.sourceSummaryLabel ? <p>{context.sourceSummaryLabel}</p> : null}
      {context.gapContexts.map((gap, index) => (
        <div key={`${gap.sourceId}:${index}`}>
          <p>{gap.detailLabel}</p>
          {gap.nextActionLabel ? (
            <p {...stylex.props([localStyles.utilityFontMono])}>
              Next: {gap.nextActionLabel}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LogEntry({
  log,
  story,
}: {
  log: ExecutionLogEntry;
  story: RuntimeStory;
}) {
  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH100px,
        localStyles.utilityFlexCol,
        localStyles.utilityGap2,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityPx3,
        localStyles.utilityPy25,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH18px,
          localStyles.utilityItemsCenter,
          localStyles.utilityGap2,
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
        ])}
      >
        <span
          {...stylex.props([
            localStyles.utilityW49px,
            localStyles.utilityShrink0,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          +{formatRuntimeDuration(logOffsetMs(story.timestamp, log.occurredAt))}
        </span>
        <span
          {...stylex.props([
            localStyles.utilityFontMedium,
            localStyles.utilityUppercase,
          ])}
          {...stylex.props(styles.statusText(logSeverityColor(log.severity)))}
        >
          {log.severity}
        </span>
      </div>
      <div
        {...stylex.props([
          localStyles.utilityH34px,
          localStyles.utilityTruncate,
          localStyles.utilityText11px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgPrimary,
        ])}
      >
        {log.body || "-"}
      </div>
      <div
        {...stylex.props([
          localStyles.utilityTruncate,
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        {log.serviceName}
        {log.traceId ? ` · trace ${log.traceId.slice(0, 12)}` : ""}
      </div>
    </section>
  );
}

function logHasAttributes(log: ExecutionLogEntry) {
  return (
    Object.keys(log.attributes).length > 0 ||
    log.redactedFields.length > 0 ||
    Boolean(log.traceId) ||
    Boolean(log.spanId)
  );
}

function LogAttributesPanel({ log }: { log: ExecutionLogEntry }) {
  const rows = [
    ...Object.entries(log.attributes),
    ...(log.redactedFields.length > 0
      ? [["redacted_fields", log.redactedFields.join(" · ")] as const]
      : []),
    ...(log.traceId ? [["trace_id", log.traceId] as const] : []),
    ...(log.spanId ? [["span_id", log.spanId] as const] : []),
  ];

  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH216px,
        localStyles.utilityFlexCol,
        localStyles.utilityGap25,
        localStyles.utilityOverflowHidden,
        localStyles.utilityBorderB,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityP3,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH5,
          localStyles.utilityItemsCenter,
          localStyles.utilityJustifyBetween,
          localStyles.utilityText10px,
          localStyles.utilityFontMedium,
          localStyles.utilityUppercase,
        ])}
      >
        <InspectorEyebrow>Attributes</InspectorEyebrow>
        <span
          {...stylex.props([
            localStyles.utilityNormalCase,
            localStyles.utilityTextFgSecondary,
          ])}
        >
          Copy JSON
        </span>
      </div>
      {rows.map(([key, value]) => (
        <div
          {...stylex.props([
            localStyles.utilityFlex,
            localStyles.utilityH27px,
            localStyles.utilityItemsCenter,
            localStyles.utilityJustifyBetween,
            localStyles.utilityGap3,
            localStyles.utilityOverflowHidden,
            localStyles.utilityFontMono,
          ])}
          key={key}
        >
          <span
            {...stylex.props([
              localStyles.utilityTruncate,
              localStyles.utilityText9px,
              localStyles.utilityTextFgTertiary,
            ])}
          >
            {key}
          </span>
          <span
            {...stylex.props([
              localStyles.utilityTruncate,
              localStyles.utilityTextRight,
              localStyles.utilityText10px,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            {formatCell(value)}
          </span>
        </div>
      ))}
    </section>
  );
}

function LogDiagnostic({ logs }: { logs: ExecutionLogEntry[] }) {
  const issueCount = logs.filter(
    (log) => log.severity === "warn" || log.severity === "error"
  ).length;
  const service = logs[0]?.serviceName ?? "runtime";
  const hasIssues = issueCount > 0;

  return (
    <section
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH256px,
        localStyles.utilityFlexCol,
        localStyles.utilityGap3,
        localStyles.utilityOverflowHidden,
        localStyles.utilityPx3,
        localStyles.utilityPy14px,
      ])}
    >
      <InspectorEyebrow>Log context</InspectorEyebrow>
      <h3
        {...stylex.props([
          localStyles.utilityText13px,
          localStyles.utilityFontMedium,
          localStyles.utilityTextFgPrimary,
        ])}
      >
        {hasIssues
          ? `${issueCount} log issue${issueCount === 1 ? "" : "s"}`
          : "No warnings or errors"}
      </h3>
      <div
        {...stylex.props(
          [localStyles.utilityH05, localStyles.utilityW280px],
          hasIssues
            ? [localStyles.utilityBgToneWarningFg]
            : [localStyles.utilityBgToneSuccessFg]
        )}
      />
      <p
        {...stylex.props([
          localStyles.utilityText10px,
          localStyles.utilityLeading15px,
          localStyles.utilityTextFgSecondary,
        ])}
      >
        {hasIssues
          ? `${issueCount} entries require operator review in ${service}.`
          : `${logs.length === 2 ? "Both entries" : `${logs.length} entries`} belong to the same trace and were emitted by ${service}.`}
      </p>
      <p
        {...stylex.props([
          localStyles.utilityFontMono,
          localStyles.utilityText10px,
          localStyles.utilityTextFgTertiary,
        ])}
      >
        Retention 7 days · structured JSON available
      </p>
    </section>
  );
}

function logOffsetMs(baseTimestamp: string, occurredAt: string) {
  const base = Date.parse(baseTimestamp);
  const occurred = Date.parse(occurredAt);
  return Number.isFinite(base) && Number.isFinite(occurred)
    ? Math.max(0, occurred - base)
    : 0;
}

function logSeverityColor(severity: string) {
  switch (severity) {
    case "error": {
      return "var(--tone-error-fg)";
    }
    case "warn": {
      return "var(--tone-warning-fg)";
    }
    case "debug":
    case "trace": {
      return "var(--fg-tertiary)";
    }
    default: {
      return "var(--tone-success-fg)";
    }
  }
}

function EmptyRows({ label }: { label: string }) {
  return (
    <div
      {...stylex.props([
        localStyles.utilityP4,
        localStyles.utilityFontMono,
        localStyles.utilityTextXs,
        localStyles.utilityTextFgTertiary,
      ])}
    >
      {label}
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function hasPanelValue(value: unknown) {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

function fieldCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 1;
}

function formatCell(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function buildBreadcrumb(story: RuntimeStory, node: ExecutionNode) {
  const path: ExecutionNode[] = [];
  const nodeById = new Map(story.nodes.map((item) => [item.id, item]));
  let current: ExecutionNode | undefined = node;
  while (current) {
    path.unshift(current);
    const currentParentId: string | undefined = current.parentId;
    current = currentParentId ? nodeById.get(currentParentId) : undefined;
  }
  return path;
}

function typeLabel(node: ExecutionNode) {
  if (node.kind === "external") {
    return "provider";
  }
  if (node.kind === "function") {
    return "function";
  }
  if (node.kind === "http") {
    return "http";
  }
  if (node.kind === "event") {
    return "outbox";
  }
  return "node";
}

function inspectorKindLabel(node: ExecutionNode) {
  const label = typeLabel(node);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
