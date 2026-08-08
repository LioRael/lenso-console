import { Button, IconSlot, Select, useConsoleLocale } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ListFilter } from "lucide-react";
import { useMemo, useState } from "react";

import { useChangeEvidence } from "../console-data/use-console-product-data";
import {
  Inspector,
  InspectorSection,
  ProductPage,
  ProductTabs,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

const localStyles = stylex.create({
  utilitySrOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: "0",
  },
});

export function ChangesPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const changes = useChangeEvidence();
  const plans = changes.rows;
  const [tabIndex, setTabIndex] = useState(0);
  const [filter, setFilter] = useState<ChangeFilterValue>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filteredPlans = useMemo(
    () =>
      plans.filter(
        (plan) =>
          filter === "all" ||
          (filter === "attention" && plan.tone === "error") ||
          (filter === "verified" && plan.tone === "success")
      ),
    [filter, plans]
  );
  const visiblePlans = tabIndex === 0 ? filteredPlans : [];
  const selected =
    visiblePlans.find((plan) => plan.id === selectedId) ?? visiblePlans[0];
  const awaitingCount = plans.filter((plan) => plan.tone === "error").length;

  return (
    <ProductPage
      description={copy.changes.description}
      meta={
        <span data-page-slot="changes-page__meta">
          {plans.length} {copy.changes.active} · {awaitingCount}{" "}
          {copy.changes.awaitingYou}
        </span>
      }
      pageKind="changes-page"
      title={copy.changes.title}
    >
      <ProductTabs
        active={copy.changes.tabs[tabIndex]!}
        items={copy.changes.tabs}
        onChange={(item) =>
          setTabIndex(copy.changes.tabs.indexOf(item as never))
        }
        pageSlot="changes-page__tabs"
      />
      <SplitWorkspace
        inspector={
          selected ? (
            <Inspector
              headerAction={
                <Button disabled variant="primary">
                  {copy.changes.approve}
                </Button>
              }
              subtitle={`${selected.id} · ${selected.module} · ${timeLabel(selected.occurredAt)}`}
              title={selected.name}
              pageSlot="changes-inspector"
            >
              <InspectorSection title={copy.changes.intent}>
                <p>{selected.detail}</p>
              </InspectorSection>
              <InspectorSection title={copy.changes.plan}>
                <p>
                  {selected.name} · {selected.state}
                </p>
              </InspectorSection>
              <InspectorSection title={copy.changes.blast}>
                <p>{selected.module}</p>
              </InspectorSection>
              <InspectorSection title={copy.changes.approval}>
                <p>Historical invocation evidence is read-only.</p>
              </InspectorSection>
              <InspectorSection title={copy.changes.verification}>
                <p>{selected.state}</p>
              </InspectorSection>
              <InspectorSection title={copy.changes.recovery}>
                <p>
                  Open the owning module surface to start a new protected
                  action.
                </p>
              </InspectorSection>
            </Inspector>
          ) : (
            <div data-page-slot="changes-page__no-data">
              {copy.common.noData}
            </div>
          )
        }
        inspectorWidth={616}
        pageSlot="changes-page__workspace"
      >
        <div data-page-slot="changes-page__list">
          <div data-page-slot="changes-page__list-header">
            <span data-page-slot="changes-page__toolbar-control">
              {copy.changes.priority}
              <IconSlot aria-hidden="true" size={16}>
                <ListFilter size={12} strokeWidth={1.5} />
              </IconSlot>
            </span>
            <span data-page-slot="changes-page__toolbar-control">
              <span {...stylex.props([localStyles.utilitySrOnly])}>
                {copy.changes.filter}
              </span>
              <Select
                aria-label={copy.changes.filter}
                data-page-slot="changes-page__toolbar-select"
                onChange={(event) =>
                  setFilter(event.currentTarget.value as ChangeFilterValue)
                }
                value={filter}
              >
                <option value="all">{copy.changes.filter}</option>
                <option value="attention">
                  {copy.changes.filterAttention}
                </option>
                <option value="verified">{copy.changes.filterVerified}</option>
              </Select>
              <IconSlot aria-hidden="true" size={16}>
                <ChevronDown size={12} strokeWidth={1.5} />
              </IconSlot>
            </span>
          </div>
          <div data-page-slot="changes-page__rows">
            {visiblePlans.length === 0 ? (
              <div data-page-slot="changes-page__empty">
                {copy.changes.noRecords}
              </div>
            ) : null}
            {visiblePlans.map((plan) => (
              <button
                aria-pressed={selected?.id === plan.id}
                data-page-slot="changes-page__row"
                data-selected={selected?.id === plan.id ? "true" : undefined}
                key={plan.id}
                onClick={() => setSelectedId(plan.id)}
                type="button"
              >
                <span data-page-slot="changes-page__row-copy">
                  <strong data-page-slot="changes-page__row-name">
                    {plan.name}
                  </strong>
                  <span data-page-slot="changes-page__row-detail">
                    {plan.detail}
                  </span>
                  <span data-page-slot="changes-page__row-id">{plan.id}</span>
                </span>
                <span data-page-slot="changes-page__row-status">
                  <StatusDot label={plan.state} tone={plan.tone} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </SplitWorkspace>
    </ProductPage>
  );
}

type ChangeFilterValue = "all" | "attention" | "verified";

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
