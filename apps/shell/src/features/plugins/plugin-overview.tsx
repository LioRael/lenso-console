import { Button } from "@lenso/ui/button";
import { Surface } from "@lenso/ui/surface";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import { pluginTechnicalSelection } from "./plugin-runtime-state";
import type { PluginWorkbenchItem } from "./plugin-workbench-model";

export type PluginDetailTab = "overview" | "configuration" | "dependencies";

const styles = stylex.create({
  root: { display: "grid", gap: tokens.space6, paddingBlock: tokens.space6 },
  cards: {
    display: "grid",
    gap: tokens.space4,
    gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
  },
  card: {
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    alignContent: "start",
    gap: tokens.space4,
    minWidth: 0,
    padding: tokens.space6,
  },
  section: { display: "grid", gap: tokens.space3, minWidth: 0 },
  title: {
    color: tokens.colorContentPrimary,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: "20px",
    margin: 0,
  },
  copy: {
    color: tokens.colorContentSecondary,
    fontSize: 12,
    lineHeight: "18px",
    margin: 0,
    overflowWrap: "anywhere",
  },
  list: {
    display: "grid",
    gap: tokens.space2,
    listStyleType: "none",
    margin: 0,
    padding: 0,
  },
  capability: {
    color: tokens.colorContentPrimary,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: "18px",
    overflowWrap: "anywhere",
  },
  facts: { display: "grid", gap: tokens.space3, margin: 0 },
  fact: { display: "grid", gap: 2, minWidth: 0 },
  label: { color: tokens.colorContentTertiary, fontSize: 11 },
  value: {
    color: tokens.colorContentPrimary,
    fontSize: 12,
    lineHeight: "18px",
    margin: 0,
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.space2 },
});

export function PluginOverview({
  onTabChange,
  plugin,
}: {
  onTabChange: (tab: PluginDetailTab) => void;
  plugin: PluginWorkbenchItem;
}) {
  const t = useConsoleTranslation();
  const { phase, selection } = pluginTechnicalSelection(plugin);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.cards)}>
        <OverviewCard title={t("Capabilities & contributions")}>
          <p {...stylex.props(styles.copy)}>
            {t("{phase} capabilities", { phase: t(phase) })}
          </p>
          <CapabilityList
            capabilities={selection?.providedCapabilities}
            emptyLabel={t("This selection provides no capabilities.")}
          />
          <p {...stylex.props(styles.copy)}>
            {t("Contribution details are not reported by this App.")}
          </p>
        </OverviewCard>
        <OverviewCard title={t("Runtime & dependencies")}>
          <dl {...stylex.props(styles.facts)}>
            <OverviewFact
              label={t("{phase} execution", { phase: t(phase) })}
              value={selection?.executionClass ?? t("Unavailable")}
            />
            <OverviewFact
              label={t("Entrypoint")}
              value={selection?.entrypoint ?? t("Unavailable")}
            />
            <OverviewFact label={t("Health")} value={t("Unknown")} />
            <OverviewFact
              label={t("Declared dependencies")}
              value={
                selection
                  ? t("{count} capabilities", {
                      count: selection.requiredCapabilities.length,
                    })
                  : t("Unavailable")
              }
            />
          </dl>
          <p {...stylex.props(styles.copy)}>
            {t("This App does not report Plugin health.")}
          </p>
        </OverviewCard>
      </div>
      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.title)}>{t("Resource access")}</h2>
        <p {...stylex.props(styles.copy)}>
          {t(
            "Physical resource mappings and access purposes are not reported by this App."
          )}
        </p>
      </section>
      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.title)}>{t("Change impact")}</h2>
        <p {...stylex.props(styles.copy)}>
          {t(
            "Preview configuration changes before publishing. The preview reports whether the App Generation changes."
          )}
        </p>
        <p {...stylex.props(styles.copy)}>
          {t(
            "Disable impact preview is unavailable. Review declared dependencies before changing Plugin selection."
          )}
        </p>
        <div {...stylex.props(styles.actions)}>
          <Button
            onClick={() => onTabChange("dependencies")}
            size="sm"
            variant="ghost"
          >
            {t("View dependencies")}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function PluginDependencies({
  plugin,
}: {
  plugin: PluginWorkbenchItem;
}) {
  const t = useConsoleTranslation();
  const { phase, selection } = pluginTechnicalSelection(plugin);
  return (
    <section {...stylex.props(styles.root)}>
      <h2 {...stylex.props(styles.title)}>{t("Declared dependencies")}</h2>
      <p {...stylex.props(styles.copy)}>
        {t("{phase} requirements", { phase: t(phase) })}
      </p>
      <CapabilityList
        capabilities={selection?.requiredCapabilities}
        emptyLabel={t("This selection declares no required capabilities.")}
      />
      <p {...stylex.props(styles.copy)}>
        {t(
          "These are declared requirements. Provider bindings and dependent Plugins are not reported by this App."
        )}
      </p>
    </section>
  );
}

function CapabilityList({
  capabilities,
  emptyLabel,
}: {
  capabilities: readonly string[] | undefined;
  emptyLabel: string;
}) {
  const t = useConsoleTranslation();
  if (!capabilities) {
    return <p {...stylex.props(styles.copy)}>{t("Selection unavailable")}</p>;
  }
  if (!capabilities.length) {
    return <p {...stylex.props(styles.copy)}>{emptyLabel}</p>;
  }
  return (
    <ul {...stylex.props(styles.list)}>
      {capabilities.map((capability) => (
        <li key={capability}>
          <code {...stylex.props(styles.capability)}>{capability}</code>
        </li>
      ))}
    </ul>
  );
}

function OverviewCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Surface variant="secondary" xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{title}</h2>
      {children}
    </Surface>
  );
}

function OverviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.fact)}>
      <dt {...stylex.props(styles.label)}>{label}</dt>
      <dd {...stylex.props(styles.value)}>{value}</dd>
    </div>
  );
}
