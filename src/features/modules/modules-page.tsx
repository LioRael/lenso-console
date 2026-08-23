import {
  DataGrid,
  DataRow,
  FilterSelect,
  IconSlot,
  PaneHeader,
  TableHeader,
  useConsoleLocale,
} from "@lenso/console-ui";
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
  artifactDigest: string | undefined;
  capabilities: readonly string[];
  defaultFromArea: boolean;
  entry: string | undefined;
  entryCount: number | undefined;
  error: string | null | undefined;
  exportName: string | undefined;
  group: string;
  grantedPermissions: readonly string[];
  id: string;
  moduleId: string;
  moduleName: string;
  moduleReleaseDigest: string | undefined;
  order: number;
  packageName: string | undefined;
  placement: string;
  presentation: string;
  protocolMajor: number | undefined;
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
            artifactDigest: module.artifactDigest,
            capabilities: surface.requiredCapabilities ?? [],
            defaultFromArea:
              surface.defaultFromArea ?? !(navigation && "group" in navigation),
            entry: module.entry,
            entryCount: module.entryCount,
            error: module.error,
            exportName: surface.exportName,
            group:
              navigation && "group" in navigation
                ? (navigation.group?.label ?? "—")
                : "—",
            grantedPermissions: module.grantedPermissions ?? [],
            id: `${module.id}:${surface.route}`,
            moduleId: module.id,
            moduleName: module.name,
            moduleReleaseDigest: module.moduleReleaseDigest,
            order: navigation?.order ?? 0,
            packageName: surface.packageName,
            placement: placementForSurface(surface),
            presentation: surface.presentation,
            protocolMajor: module.protocolMajor,
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
      pageKind="modules-page"
      title={copy.modules.title}
    >
      <div data-page-slot="modules-page__filters">
        <ModulesFilterSelect
          ariaLabel={copy.modules.source}
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
          pageSlot="modules-page__filter-control--source"
          value={source}
        />
        <ModulesFilterSelect
          ariaLabel={copy.modules.placement}
          onChange={(value) => setArea(value as AreaFilter)}
          options={[
            { label: copy.modules.allAreas, value: "all" },
            { label: "Runtime", value: "runtime" },
            { label: "Operations", value: "operations" },
            { label: "Data", value: "data" },
            { label: "Configuration", value: "configuration" },
          ]}
          pageSlot="modules-page__filter-control--area"
          value={area}
        />
        <ModulesFilterSelect
          ariaLabel={copy.modules.state}
          onChange={(value) => setState(value as StateFilter)}
          options={[
            { label: copy.modules.allStates, value: "all" },
            { label: copy.modules.registeredState, value: "loaded" },
            { label: "Error", value: "error" },
          ]}
          pageSlot="modules-page__filter-control--state"
          value={state}
        />
      </div>
      <SplitWorkspace
        inspector={
          selected ? (
            <Inspector
              status={
                <div data-page-slot="modules-inspector__status">
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
              pageSlot="modules-inspector"
            >
              <InspectorSection title={copy.modules.manifest}>
                <p>ModuleManifest.console</p>
                <p>Area: {selected.area}</p>
                <p>Surface: {selected.surface.toLowerCase()}</p>
              </InspectorSection>
              <InspectorSection title={copy.modules.identity}>
                <p>{selected.packageName ?? `Module: ${selected.moduleId}`}</p>
                <p>
                  {selected.exportName
                    ? `Export: ${selected.exportName}`
                    : `Presentation: ${selected.presentation}`}
                </p>
                <p>Source: {sourceLabel(selected.source, copy.modules)}</p>
                {selected.moduleReleaseDigest ? (
                  <p>Release: {shortDigest(selected.moduleReleaseDigest)}</p>
                ) : null}
                {selected.artifactDigest ? (
                  <p>Artifact: {shortDigest(selected.artifactDigest)}</p>
                ) : null}
              </InspectorSection>
              <InspectorSection title={copy.modules.executionEvidence}>
                <p>
                  {copy.modules.protocol}: {selected.protocolMajor ?? "—"}
                </p>
                <p>
                  {copy.modules.entry}: {selected.entry ?? "—"}
                </p>
                <p>
                  {copy.modules.entries}: {selected.entryCount ?? 0}
                </p>
                <p>
                  {copy.modules.permissions}:{" "}
                  {selected.grantedPermissions.length}
                </p>
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
              <InspectorSection title={copy.modules.removalPreview}>
                <p>
                  {copy.modules.removalSurfaceImpact}:{" "}
                  {surfaceCountForModule(registrations, selected.moduleId)}
                </p>
                <p>{copy.modules.removalAuthority}</p>
              </InspectorSection>
            </Inspector>
          ) : (
            <p data-page-slot="modules-page__no-data">
              {copy.modules.noMatches}
            </p>
          )
        }
        pageSlot="modules-page__workspace"
      >
        <section data-page-slot="modules-page__table-pane">
          <PaneHeader
            meta={`${filteredRegistrations.length} ${copy.modules.registered}`}
            title={copy.modules.registry}
          />
          <DataGrid>
            <TableHeader
              columns={[
                copy.modules.surface,
                copy.modules.module,
                copy.modules.placement,
                copy.modules.registration,
              ]}
            />
            {filteredRegistrations.length === 0 ? (
              <div data-page-slot="modules-page__empty">
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
          </DataGrid>
        </section>
      </SplitWorkspace>
    </ProductPage>
  );
}

function ModulesFilterSelect({
  ariaLabel,
  pageSlot,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  pageSlot?: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}) {
  return (
    <FilterSelect
      aria-label={ariaLabel}
      data-page-slot={`modules-page__filter-control${pageSlot ? ` ${pageSlot}` : ""}`}
      icon={<ChevronDown size={12} strokeWidth={1.5} />}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </FilterSelect>
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

function shortDigest(digest: string) {
  return digest.length > 24 ? `${digest.slice(0, 21)}…` : digest;
}

function surfaceCountForModule(
  registrations: readonly SurfaceRegistration[],
  moduleId: string
) {
  return registrations.filter((item) => item.moduleId === moduleId).length;
}
