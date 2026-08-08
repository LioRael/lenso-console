import { useConsoleLocale } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { ArrowRight } from "lucide-react";

import {
  type HomeEvidenceItem,
  useHomeEvidence,
} from "../console-data/use-console-product-data";
import { ProductPage } from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

const localStyles = stylex.create({
  utilityGrid: {
    display: "grid",
  },
  utilityH74px: {
    height: "74px",
  },
  utilityGridCols4: {
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  },
  utilityItemsCenter: {
    alignItems: "center",
  },
  utilityBorderY: {
    borderBlockStyle: "solid",
    borderBlockWidth: "1px",
  },
  utilityBorderLineSubtle: {
    borderColor: "var(--line-subtle)",
  },
  utilityH618px: {
    height: "618px",
  },
  utilityMinH0: {
    minHeight: "calc(0.25rem * 0)",
  },
  utilityGridColsMinmax01fr376px: {
    gridTemplateColumns: "minmax(0,1fr) 376px",
  },
  utilityOverflowHidden: {
    overflow: "hidden",
  },
  utilityPr7: {
    paddingRight: "calc(0.25rem * 7)",
  },
  utilityPt7: {
    paddingTop: "calc(0.25rem * 7)",
  },
  utilityFlex: {
    display: "flex",
  },
  utilityH38px: {
    height: "38px",
  },
  utilityBorderB: {
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  utilityText15px: {
    fontSize: "15px",
  },
  utilityFontMedium: {
    fontWeight: "500",
  },
  utilityLeading22px: {
    lineHeight: "22px",
  },
  utilityMlAuto: {
    marginLeft: "auto",
  },
  utilityInlineFlex: {
    display: "inline-flex",
  },
  utilityGap1: {
    gap: "calc(0.25rem * 1)",
  },
  utilityText11px: {
    fontSize: "11px",
  },
  utilityLeading4: {
    lineHeight: "calc(0.25rem * 4)",
  },
  utilityTextFgSecondary: {
    color: "var(--fg-secondary)",
  },
  utilityHoverTextFgPrimary: {
    ":hover": {
      color: "var(--fg-primary)",
    },
  },
  utilityH88px: {
    height: "88px",
  },
  utilityGridColsMinmax01frAuto: {
    gridTemplateColumns: "minmax(0,1fr) auto",
  },
  utilityMinW0: {
    minWidth: "calc(0.25rem * 0)",
  },
  utilityItemsStart: {
    alignItems: "flex-start",
  },
  utilityGap3: {
    gap: "calc(0.25rem * 3)",
  },
  utilityRelative: {
    position: "relative",
  },
  utilityH18px: {
    height: "18px",
  },
  utilityW7px: {
    width: "7px",
  },
  utilityShrink0: {
    flexShrink: "0",
  },
  utilityText13px: {
    fontSize: "13px",
  },
  utilityLeading18px: {
    lineHeight: "18px",
  },
  utilityMt3px: {
    marginTop: "3px",
  },
  utilityFontMono: {
    fontFamily:
      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',\n    monospace)",
  },
  utilityText10px: {
    fontSize: "10px",
  },
  utilityLeading14px: {
    lineHeight: "14px",
  },
  utilityTextFgTertiary: {
    color: "var(--fg-tertiary)",
  },
  utilitySelfCenter: {
    alignSelf: "center",
  },
  utilityPl7: {
    paddingLeft: "calc(0.25rem * 7)",
  },
  utilityTextSuccess: {
    color: "var(--success)",
  },
  utilityH72px: {
    height: "72px",
  },
  utilityGridCols8pxMinmax01fr: {
    gridTemplateColumns: "8px minmax(0,1fr)",
  },
  utilityPt4: {
    paddingTop: "calc(0.25rem * 4)",
  },
  utilityH12: {
    height: "calc(0.25rem * 12)",
  },
  utilityW2: {
    width: "calc(0.25rem * 2)",
  },
  utilityAbsolute: {
    position: "absolute",
  },
  utilityLeft0: {
    left: "calc(0.25rem * 0)",
  },
  utilityTop1: {
    top: "calc(0.25rem * 1)",
  },
  utilitySize6px: {
    width: "6px",
    height: "6px",
  },
  utilityRoundedFull: {
    borderRadius: "calc(infinity * 1px)",
  },
  utilityBgFgTertiary: {
    backgroundColor: "var(--fg-tertiary)",
  },
  utilityWhitespaceNowrap: {
    whiteSpace: "nowrap",
  },
  utilityBlock: {
    display: "block",
  },
  utilityMt2px: {
    marginTop: "2px",
  },
  utilityTextEllipsis: {
    textOverflow: "ellipsis",
  },
  utilityText12px: {
    fontSize: "12px",
  },
  utilityBorderT: {
    borderTopStyle: "solid",
    borderTopWidth: "1px",
  },
  utilityPt14px: {
    paddingTop: "14px",
  },
  utilityTextFgPrimary: {
    color: "var(--fg-primary)",
  },
  utilityMt1: {
    marginTop: "calc(0.25rem * 1)",
  },
  utilityH30px: {
    height: "30px",
  },
  utilityGap2: {
    gap: "calc(0.25rem * 2)",
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
  utilityPx10px: {
    paddingInline: "10px",
  },
  utilityFlexCol: {
    flexDirection: "column",
  },
  utilityJustifyBetween: {
    justifyContent: "space-between",
  },
  utilityBorderR: {
    borderRightStyle: "solid",
    borderRightWidth: "1px",
  },
  utilityPx4: {
    paddingInline: "calc(0.25rem * 4)",
  },
  utilityFirstPl0: {
    ":first-child": {
      paddingLeft: "calc(0.25rem * 0)",
    },
  },
  utilityLastBorderR0: {
    ":last-child": {
      borderRightWidth: "0px",
    },
  },
  utilityH5: {
    height: "calc(0.25rem * 5)",
  },
  utilityItemsBaseline: {
    alignItems: "baseline",
  },
  utilityLeading5: {
    lineHeight: "calc(0.25rem * 5)",
  },
  decisionDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    height: 7,
    left: 0,
    position: "absolute",
    top: "5.5px",
    width: 7,
  }),
  metricNote: (color: string) => ({
    color,
    fontSize: 11,
    lineHeight: "16px",
  }),
  scopeDot: (color: string) => ({
    backgroundColor: color,
    borderRadius: "9999px",
    height: 6,
    width: 6,
  }),
});

type HomeDecision = {
  action: string;
  detail: string;
  id: string;
  name: string;
  tone: HomeEvidenceItem["tone"] | "primary";
};

type HomeEvidenceRow = HomeEvidenceItem & {
  displayTime?: string;
};

const demoDecisions: HomeDecision[] = [
  {
    action: "Review",
    detail: "Permission policy change requires approval",
    id: "chg_01J7Q9",
    name: "auth-policy-v7",
    tone: "warning",
  },
  {
    action: "Inspect",
    detail: "Agent plan is applying across 3 services",
    id: "chg_01J7PZ",
    name: "billing-sync",
    tone: "neutral",
  },
  {
    action: "Open",
    detail: "Release verified; evidence bundle complete",
    id: "rel_01J7PX",
    name: "runtime-0.3.34",
    tone: "success",
  },
  {
    action: "Open",
    detail: "Draft plan has no material risk delta",
    id: "chg_01J7PW",
    name: "customer-index",
    tone: "primary",
  },
];

const demoEvidence: HomeEvidenceRow[] = [
  {
    detail: "auth-policy-v7 · Leo",
    displayTime: "12:04:18",
    id: "approval-recorded",
    occurredAt: "2026-08-04T04:04:18.000Z",
    title: "Approval recorded",
    tone: "success",
  },
  {
    detail: "billing-sync · 3/3 services",
    displayTime: "12:03:51",
    id: "verification-passed",
    occurredAt: "2026-08-04T04:03:51.000Z",
    title: "Verification passed",
    tone: "success",
  },
  {
    detail: "scope: runtime.config",
    displayTime: "12:02:09",
    id: "agent-plan-bounded",
    occurredAt: "2026-08-04T04:02:09.000Z",
    title: "Agent plan bounded",
    tone: "neutral",
  },
  {
    detail: "rel_01J7PX · 14 artifacts",
    displayTime: "11:58:44",
    id: "evidence-attached",
    occurredAt: "2026-08-04T03:58:44.000Z",
    title: "Evidence attached",
    tone: "success",
  },
  {
    detail: "customer-index · pre-apply",
    displayTime: "11:54:12",
    id: "recovery-point-stored",
    occurredAt: "2026-08-04T03:54:12.000Z",
    title: "Recovery point stored",
    tone: "neutral",
  },
];

export function HomePage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const { changes, evidence, mode, summary: summaryQuery } = useHomeEvidence();
  const summary = summaryQuery.data;
  const decisions: HomeDecision[] =
    mode === "demo"
      ? demoDecisions
      : changes.rows.slice(0, 4).map((item) => ({
          action: copy.home.viewAll,
          detail: item.detail,
          id: item.id,
          name: item.name,
          tone: item.tone,
        }));
  const displayedEvidence: HomeEvidenceRow[] =
    mode === "demo" ? demoEvidence : evidence.slice(0, 5);
  const healthy = mode === "demo" || summary?.status === "healthy";
  const activeRuntime =
    mode === "demo"
      ? "12 / 12"
      : String(
          summary
            ? summary.outbox.pending +
                summary.outbox.processing +
                summary.functions.pending +
                summary.functions.running
            : 0
        );
  const attention = decisions.filter(
    (item) => item.tone === "warning" || item.tone === "error"
  ).length;
  const activeChangesNote = `${attention} ${attention === 1 ? "needs" : "need"} review`;

  return (
    <ProductPage
      description={copy.home.description}
      meta={<ScopeBadge label="Production" mode={mode} tone="success" />}
      pageKind="home-page"
      title={copy.home.title}
    >
      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityH74px,
          localStyles.utilityGridCols4,
          localStyles.utilityItemsCenter,
          localStyles.utilityBorderY,
          localStyles.utilityBorderLineSubtle,
        ])}
      >
        <Metric
          label={copy.home.runtime}
          note={
            mode === "demo"
              ? "healthy"
              : healthy
                ? "healthy"
                : (summary?.status ?? "loading")
          }
          value={activeRuntime}
        />
        <Metric
          label={copy.home.activeChanges}
          note={activeChangesNote}
          value={mode === "demo" ? "3" : String(decisions.length)}
        />
        <Metric
          label={copy.home.awaitingApproval}
          note="bounded action"
          value={String(mode === "demo" ? 1 : attention)}
        />
        <Metric
          label={copy.home.evidenceLag}
          note={mode === "demo" ? "within target" : "latest observation"}
          value={
            mode === "live" && displayedEvidence[0]
              ? relativeSeconds(displayedEvidence[0].occurredAt)
              : mode === "demo"
                ? "42s"
                : "—"
          }
        />
      </div>
      <div
        {...stylex.props([
          localStyles.utilityGrid,
          localStyles.utilityH618px,
          localStyles.utilityMinH0,
          localStyles.utilityGridColsMinmax01fr376px,
          localStyles.utilityOverflowHidden,
        ])}
      >
        <section
          {...stylex.props([
            localStyles.utilityH618px,
            localStyles.utilityMinH0,
            localStyles.utilityOverflowHidden,
            localStyles.utilityPr7,
            localStyles.utilityPt7,
          ])}
        >
          <header
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityH38px,
              localStyles.utilityItemsCenter,
              localStyles.utilityBorderB,
              localStyles.utilityBorderLineSubtle,
            ])}
          >
            <h2
              {...stylex.props([
                localStyles.utilityText15px,
                localStyles.utilityFontMedium,
                localStyles.utilityLeading22px,
              ])}
            >
              {copy.home.decisionQueue}
            </h2>
            <a
              {...stylex.props([
                localStyles.utilityMlAuto,
                localStyles.utilityInlineFlex,
                localStyles.utilityItemsCenter,
                localStyles.utilityGap1,
                localStyles.utilityText11px,
                localStyles.utilityLeading4,
                localStyles.utilityTextFgSecondary,
                localStyles.utilityHoverTextFgPrimary,
              ])}
              href="/changes"
            >
              {copy.home.viewAll} <ArrowRight size={12} />
            </a>
          </header>
          {decisions.map((item) => (
            <article
              {...stylex.props([
                localStyles.utilityGrid,
                localStyles.utilityH88px,
                localStyles.utilityMinH0,
                localStyles.utilityGridColsMinmax01frAuto,
                localStyles.utilityItemsCenter,
                localStyles.utilityBorderB,
                localStyles.utilityBorderLineSubtle,
              ])}
              key={item.id}
            >
              <div
                {...stylex.props([
                  localStyles.utilityFlex,
                  localStyles.utilityMinW0,
                  localStyles.utilityItemsStart,
                  localStyles.utilityGap3,
                ])}
              >
                <span
                  aria-hidden="true"
                  {...stylex.props([
                    localStyles.utilityRelative,
                    localStyles.utilityH18px,
                    localStyles.utilityW7px,
                    localStyles.utilityShrink0,
                  ])}
                >
                  <span
                    {...stylex.props(
                      localStyles.decisionDot(decisionToneColor(item.tone))
                    )}
                  />
                </span>
                <div {...stylex.props([localStyles.utilityMinW0])}>
                  <h3
                    {...stylex.props([
                      localStyles.utilityText13px,
                      localStyles.utilityFontMedium,
                      localStyles.utilityLeading18px,
                    ])}
                  >
                    {item.name}
                  </h3>
                  <p
                    {...stylex.props([
                      localStyles.utilityMt3px,
                      localStyles.utilityText11px,
                      localStyles.utilityLeading4,
                      localStyles.utilityTextFgSecondary,
                    ])}
                  >
                    {item.detail}
                  </p>
                  <p
                    {...stylex.props([
                      localStyles.utilityMt3px,
                      localStyles.utilityFontMono,
                      localStyles.utilityText10px,
                      localStyles.utilityLeading14px,
                      localStyles.utilityTextFgTertiary,
                    ])}
                  >
                    {item.id}
                  </p>
                </div>
              </div>
              <a
                {...stylex.props([
                  localStyles.utilityFlex,
                  localStyles.utilityItemsCenter,
                  localStyles.utilityGap1,
                  localStyles.utilitySelfCenter,
                  localStyles.utilityText11px,
                  localStyles.utilityLeading4,
                  localStyles.utilityTextFgSecondary,
                  localStyles.utilityHoverTextFgPrimary,
                ])}
                href="/changes"
              >
                {item.action} <ArrowRight size={12} />
              </a>
            </article>
          ))}
        </section>
        <aside
          data-page-slot="home-page__evidence-pane"
          {...stylex.props([
            localStyles.utilityH618px,
            localStyles.utilityMinH0,
            localStyles.utilityOverflowHidden,
            localStyles.utilityPl7,
            localStyles.utilityPt7,
          ])}
        >
          <header
            {...stylex.props([
              localStyles.utilityFlex,
              localStyles.utilityH38px,
              localStyles.utilityItemsCenter,
              localStyles.utilityBorderB,
              localStyles.utilityBorderLineSubtle,
            ])}
          >
            <h2
              {...stylex.props([
                localStyles.utilityText15px,
                localStyles.utilityFontMedium,
                localStyles.utilityLeading22px,
              ])}
            >
              {copy.home.liveEvidence}
            </h2>
            <span
              {...stylex.props([
                localStyles.utilityMlAuto,
                localStyles.utilityText11px,
                localStyles.utilityLeading4,
                localStyles.utilityTextSuccess,
              ])}
            >
              {copy.home.streaming}
            </span>
          </header>
          <ol>
            {displayedEvidence.map((item) => (
              <li
                {...stylex.props([
                  localStyles.utilityGrid,
                  localStyles.utilityH72px,
                  localStyles.utilityMinH0,
                  localStyles.utilityGridCols8pxMinmax01fr,
                  localStyles.utilityGap3,
                  localStyles.utilityOverflowHidden,
                  localStyles.utilityPt4,
                ])}
                key={item.id}
              >
                <span
                  aria-hidden="true"
                  {...stylex.props([
                    localStyles.utilityRelative,
                    localStyles.utilityH12,
                    localStyles.utilityW2,
                  ])}
                >
                  <span
                    {...stylex.props([
                      localStyles.utilityAbsolute,
                      localStyles.utilityLeft0,
                      localStyles.utilityTop1,
                      localStyles.utilitySize6px,
                      localStyles.utilityRoundedFull,
                      localStyles.utilityBgFgTertiary,
                    ])}
                  />
                </span>
                <div
                  {...stylex.props([
                    localStyles.utilityMinW0,
                    localStyles.utilityOverflowHidden,
                    localStyles.utilityWhitespaceNowrap,
                  ])}
                >
                  <time
                    {...stylex.props([
                      localStyles.utilityBlock,
                      localStyles.utilityFontMono,
                      localStyles.utilityText10px,
                      localStyles.utilityLeading14px,
                      localStyles.utilityTextFgTertiary,
                    ])}
                  >
                    {item.displayTime ?? timeLabel(item.occurredAt)}
                  </time>
                  <div
                    {...stylex.props([
                      localStyles.utilityMt2px,
                      localStyles.utilityOverflowHidden,
                      localStyles.utilityTextEllipsis,
                      localStyles.utilityText12px,
                      localStyles.utilityFontMedium,
                      localStyles.utilityLeading4,
                    ])}
                  >
                    {item.title}
                  </div>
                  <div
                    {...stylex.props([
                      localStyles.utilityMt2px,
                      localStyles.utilityOverflowHidden,
                      localStyles.utilityTextEllipsis,
                      localStyles.utilityText11px,
                      localStyles.utilityLeading4,
                      localStyles.utilityTextFgSecondary,
                    ])}
                  >
                    {item.detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div
            {...stylex.props([
              localStyles.utilityBorderT,
              localStyles.utilityBorderLineSubtle,
              localStyles.utilityPt14px,
              localStyles.utilityText11px,
              localStyles.utilityLeading4,
              localStyles.utilityTextFgSecondary,
            ])}
          >
            <p
              {...stylex.props([
                localStyles.utilityFontMedium,
                localStyles.utilityLeading4,
                localStyles.utilityTextFgPrimary,
              ])}
            >
              Console coordinates intent and evidence.
            </p>
            <p
              {...stylex.props([
                localStyles.utilityMt1,
                localStyles.utilityLeading4,
              ])}
            >
              Services remain authoritative for state and effects.
            </p>
          </div>
        </aside>
      </div>
    </ProductPage>
  );
}

function decisionToneColor(tone: HomeDecision["tone"]) {
  switch (tone) {
    case "error": {
      return "var(--error)";
    }
    case "success": {
      return "var(--success)";
    }
    case "warning": {
      return "var(--warning)";
    }
    case "primary": {
      return "var(--fg-primary)";
    }
    default: {
      return "var(--fg-secondary)";
    }
  }
}

function ScopeBadge({
  label,
  mode,
  tone,
}: {
  label: string;
  mode: "demo" | "live";
  tone: "neutral" | "success";
}) {
  return (
    <span
      aria-label={mode === "demo" ? `${label}, demo projection` : label}
      {...stylex.props([
        localStyles.utilityInlineFlex,
        localStyles.utilityH30px,
        localStyles.utilityItemsCenter,
        localStyles.utilityGap2,
        localStyles.utilityRoundedVarRadiusControl,
        localStyles.utilityBorder,
        localStyles.utilityBorderLine,
        localStyles.utilityPx10px,
        localStyles.utilityText11px,
        localStyles.utilityFontMedium,
        localStyles.utilityLeading4,
        localStyles.utilityTextFgSecondary,
      ])}
      data-console-data-mode={mode}
      title={mode === "demo" ? "Demo projection" : undefined}
    >
      <span
        aria-hidden="true"
        {...stylex.props(
          localStyles.scopeDot(
            tone === "success" ? "var(--success)" : "var(--fg-tertiary)"
          )
        )}
      />
      {label}
    </span>
  );
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour12: false });
}

function relativeSeconds(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))}s`;
}

function Metric({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div
      {...stylex.props([
        localStyles.utilityFlex,
        localStyles.utilityH12,
        localStyles.utilityFlexCol,
        localStyles.utilityJustifyBetween,
        localStyles.utilityBorderR,
        localStyles.utilityBorderLineSubtle,
        localStyles.utilityPx4,
        localStyles.utilityFirstPl0,
        localStyles.utilityLastBorderR0,
      ])}
    >
      <div
        {...stylex.props([
          localStyles.utilityFlex,
          localStyles.utilityH5,
          localStyles.utilityItemsBaseline,
          localStyles.utilityGap2,
        ])}
      >
        <strong
          {...stylex.props([
            localStyles.utilityText15px,
            localStyles.utilityFontMedium,
            localStyles.utilityLeading5,
          ])}
        >
          {value}
        </strong>
        <span
          {...stylex.props([
            localStyles.utilityText11px,
            localStyles.utilityLeading4,
            localStyles.utilityTextFgTertiary,
          ])}
        >
          {label}
        </span>
      </div>
      <div
        {...stylex.props(
          localStyles.metricNote(
            note.includes("review") ? "var(--warning)" : "var(--fg-secondary)"
          )
        )}
      >
        {note}
      </div>
    </div>
  );
}
