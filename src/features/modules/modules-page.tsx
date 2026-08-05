import {
  DataRow,
  IconSlot,
  PaneHeader,
  Select,
  TableHeader,
  useConsoleLocale,
} from "@lenso/console-ui-internal";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import {
  useModuleRegistry,
  type ModuleRegistrySurfaceRow,
} from "../console-data/use-console-product-data";
import {
  Inspector,
  InspectorSection,
  ProductPage,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

type SourceFilter =
  | "all"
  | "first_party"
  | "installed"
  | "linked"
  | "runtime_bundle"
  | "service";
type AreaFilter = "all" | "runtime" | "operations" | "data" | "configuration";
type StateFilter = "all" | "loaded" | "error";

type SurfaceRegistration = {
  area: string;
  capabilities: readonly string[];
  defaultFromArea: boolean;
  error: string | null | undefined;
  exportName: string | undefined;
  presentation: string;
  group: string;
  id: string;
  moduleId: string;
  moduleName: string;
  order: number;
  packageName: string | undefined;
  placement: string;
  route: string;
  source: string;
  state: string;
  surface: string;
  workspace: string;
};

export function ModulesPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const registry = useModuleRegistry();
  const modules = registry.rows;
  const registrations = useMemo<SurfaceRegistration[]>(
    () =>
      modules.flatMap((module) =>
        module.surfaces.map((surface) => {
          const { navigation } = surface;
          return {
            area: surface.area,
            capabilities: surface.requiredCapabilities ?? [],
            defaultFromArea:
              surface.defaultFromArea ?? !(navigation && "group" in navigation),
            error: module.error,
            exportName: surface.exportName,
            presentation: surface.presentation,
            group:
              navigation && "group" in navigation
                ? (navigation.group?.label ?? "—")
                : "—",
            id: `${module.id}:${surface.route}`,
            moduleId: module.id,
            moduleName: module.name,
            order: navigation?.order ?? 0,
            packageName: surface.packageName,
            placement: placementForSurface(surface),
            route: surface.route,
            source: module.source,
            state: module.state,
            surface: surface.label,
            workspace: navigation?.workspace.label ?? "System",
          };
        })
      ),
    [modules]
  );
  const [source, setSource] = useState<SourceFilter>("all");
  const [area, setArea] = useState<AreaFilter>("all");
  const [state, setState] = useState<StateFilter>("all");
  const filteredRegistrations = useMemo(
    () =>
      registrations.filter(
        (registration) =>
          (source === "all" || registration.source === source) &&
          (area === "all" || registration.area === area) &&
          (state === "all" || registration.state === state)
      ),
    [area, registrations, source, state]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    filteredRegistrations.find(
      (registration) => registration.id === selectedId
    ) ??
    filteredRegistrations[0] ??
    registrations.find((registration) => registration.id === selectedId) ??
    registrations[0];
  const surfaceCount = registrations.length;

  return (
    <ProductPage
      description={copy.modules.description}
      meta={`${modules.length} ${copy.modules.moduleCount} · ${surfaceCount} ${copy.modules.surfaces.toLowerCase()}`}
      pageClassName="modules-page"
      title={copy.modules.title}
    >
      <div className="modules-page__filters">
        <ModulesFilterSelect
          ariaLabel={copy.modules.source}
          className="modules-page__filter-control--source"
          onChange={(value) => setSource(value as SourceFilter)}
          options={[
            { label: copy.modules.allSources, value: "all" },
            { label: copy.modules.sourceFirstParty, value: "first_party" },
            { label: copy.modules.sourceLinked, value: "linked" },
            { label: copy.modules.sourceService, value: "service" },
            { label: copy.modules.sourceInstalled, value: "installed" },
            {
              label: copy.modules.sourceRuntimeBundle,
              value: "runtime_bundle",
            },
          ]}
          value={source}
        />
        <ModulesFilterSelect
          ariaLabel={copy.modules.placement}
          className="modules-page__filter-control--area"
          onChange={(value) => setArea(value as AreaFilter)}
          options={[
            { label: copy.modules.allAreas, value: "all" },
            { label: "Runtime", value: "runtime" },
            { label: "Operations", value: "operations" },
            { label: "Data", value: "data" },
            { label: "Configuration", value: "configuration" },
          ]}
          value={area}
        />
        <ModulesFilterSelect
          ariaLabel={copy.modules.state}
          className="modules-page__filter-control--state"
          onChange={(value) => setState(value as StateFilter)}
          options={[
            { label: copy.modules.allStates, value: "all" },
            { label: copy.modules.registeredState, value: "loaded" },
            { label: "Error", value: "error" },
          ]}
          value={state}
        />
      </div>
      <SplitWorkspace
        className="modules-page__workspace"
        inspector={
          selected ? (
            <Inspector
              className="product-inspector modules-inspector"
              status={
                <div className="modules-inspector__status">
                  <StatusDot
                    label={copy.modules.registeredState}
                    tone={selected.state === "loaded" ? "success" : "error"}
                  />
                  <span aria-hidden="true">·</span>
                  <a href={selected.route}>
                    {copy.modules.openSystem}
                    <IconSlot aria-hidden="true" size={12}>
                      <ExternalLink size={12} strokeWidth={1.5} />
                    </IconSlot>
                  </a>
                </div>
              }
              subtitle={selected.route}
              title={selected.surface}
            >
              <InspectorSection title={copy.modules.manifest}>
                <p>ModuleManifest.console</p>
                <p>Area: {selected.area}</p>
                <p>Surface: {selected.surface.toLowerCase()}</p>
              </InspectorSection>
              <InspectorSection title={copy.modules.ownership}>
                <p>{selected.packageName ?? `Module: ${selected.moduleId}`}</p>
                <p>
                  {selected.exportName
                    ? `Export: ${selected.exportName}`
                    : `Presentation: ${selected.presentation}`}
                </p>
                <p>Source: {sourceLabel(selected.source, copy.modules)}</p>
              </InspectorSection>
              <InspectorSection title={copy.modules.navigation}>
                <p>Workspace: {selected.workspace}</p>
                {selected.defaultFromArea ? (
                  <p>
                    {copy.modules.defaultFromArea}: {selected.area}
                  </p>
                ) : (
                  <p>
                    {copy.modules.group}: {selected.group}
                  </p>
                )}
                <p>Order: {selected.order}</p>
              </InspectorSection>
              <InspectorSection title={copy.modules.evidence}>
                {selected.capabilities[0] ? (
                  <>
                    <p>{selected.capabilities[0]}</p>
                    <p>{copy.modules.capabilityGranted}</p>
                  </>
                ) : (
                  <p>Access gate: {copy.modules.noCapabilities}</p>
                )}
                <p>
                  {selected.state === "loaded"
                    ? copy.modules.routeRegistered
                    : (selected.error ?? "Module unavailable")}
                </p>
              </InspectorSection>
            </Inspector>
          ) : (
            <p className="modules-page__no-data">{copy.modules.noMatches}</p>
          )
        }
      >
        <section className="modules-page__table-pane">
          <PaneHeader
            meta={`${filteredRegistrations.length} ${copy.modules.registered}`}
            title={copy.modules.registry}
          />
          <div className="lenso-ui-data-grid">
            <TableHeader
              columns={[
                copy.modules.surface,
                copy.modules.module,
                copy.modules.placement,
                copy.modules.registration,
              ]}
            />
            {filteredRegistrations.length === 0 ? (
              <div className="modules-page__empty">
                {copy.modules.noMatches}
              </div>
            ) : (
              filteredRegistrations.map((registration) => (
                <DataRow
                  cells={[
                    registration.moduleName,
                    registration.placement,
                    <StatusDot
                      label={copy.modules.registeredState}
                      key={`${registration.id}-status`}
                      tone={
                        registration.state === "loaded" ? "success" : "error"
                      }
                    />,
                  ]}
                  interactive
                  key={registration.id}
                  onActivate={() => setSelectedId(registration.id)}
                  onClick={() => setSelectedId(registration.id)}
                  primary={registration.surface}
                  secondary={registration.route}
                  selected={selected?.id === registration.id}
                />
              ))
            )}
          </div>
        </section>
      </SplitWorkspace>
    </ProductPage>
  );
}

function ModulesFilterSelect({
  ariaLabel,
  className,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className={`modules-page__filter-control ${className ?? ""}`}>
      <span className="sr-only">{ariaLabel}</span>
      <Select
        aria-label={ariaLabel}
        className="modules-page__filter-select"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <IconSlot
        aria-hidden="true"
        className="modules-page__filter-icon"
        size={12}
      >
        <ChevronDown size={12} strokeWidth={1.5} />
      </IconSlot>
    </label>
  );
}

function sourceLabel(
  source: string,
  copy: ReturnType<typeof consoleProductCopy>["modules"]
) {
  if (source === "linked") {
    return copy.sourceLinked;
  }
  if (source === "service") {
    return copy.sourceService;
  }
  return copy.sourceFirstParty;
}

function placementForSurface(surface: ModuleRegistrySurfaceRow) {
  const workspace = surface.navigation?.workspace.label ?? "System";
  const group =
    surface.navigation && "group" in surface.navigation
      ? surface.navigation.group?.label
      : undefined;
  return `${workspace} / ${group ?? areaLabel(surface.area)}`;
}

function areaLabel(area: string) {
  return area.charAt(0).toUpperCase() + area.slice(1);
}
