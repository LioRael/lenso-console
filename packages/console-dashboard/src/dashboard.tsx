import {
  bindConsole,
  defineConsolePlugin,
  useConsoleActivation,
  ConsolePageScope,
  ConsoleLayout,
  ConsoleIconButton,
  type ConsoleActivation,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import { Button } from "@lenso/ui/button";
import { Modal } from "@lenso/ui/modal";
import { Popover } from "@lenso/ui/popover";
import * as stylex from "@stylexjs/stylex";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { noCompactor, useContainerWidth, type Layout } from "react-grid-layout";

import type {
  DashboardDocument,
  DashboardSnapshot,
  DashboardStore,
} from "./contract";
import { styles } from "./dashboard.styles";
import { DashboardDraft, type DashboardInstance } from "./draft";
import { PointerGridLayout as GridLayout } from "./pointer-grid-layout";
import {
  canonicalJson,
  dashboardLimits,
  definitionKey,
  definitionMap,
} from "./validation";
import type { DashboardWidgetDefinition } from "./widgets";

export interface DashboardServices {
  store: DashboardStore;
  widgets: readonly DashboardWidgetDefinition[];
  defaults: DashboardDocument;
  /** Change when the trusted session or widget permissions change. Not a storage key. */
  permissionKey: string;
  canUseWidget?(definition: DashboardWidgetDefinition): boolean;
}

class WidgetBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>Widget unavailable.</p> : this.props.children;
  }
}

function ActiveWidget({
  instance,
  definition,
  parent,
  parentSignal,
}: {
  instance: DashboardInstance;
  definition: DashboardWidgetDefinition;
  parent: ConsoleActivation;
  parentSignal: AbortSignal;
}) {
  const identity = useMemo(
    () => ({
      renderer: definition.renderer,
      revision: definition.implementationRevision,
      parent,
    }),
    [definition.renderer, definition.implementationRevision, parent]
  );
  const { activation, signal } = useConsoleActivation(identity, parentSignal);
  const configSignature = canonicalJson(instance.config);
  const config = useMemo(
    () => JSON.parse(configSignature) as DashboardInstance["config"],
    [configSignature]
  );
  const reference = useMemo(
    () => ({
      bindingId: definition.bindingId,
      widgetId: definition.widgetId,
      ...(definition.implementationRevision === undefined
        ? {}
        : {
            implementationRevision: definition.implementationRevision,
          }),
    }),
    [
      definition.bindingId,
      definition.widgetId,
      definition.implementationRevision,
    ]
  );
  const Renderer = definition.renderer;
  return (
    <WidgetBoundary key={activation.key}>
      <Renderer
        instanceId={instance.id}
        config={config}
        definition={reference}
        activation={activation}
        signal={signal}
      />
    </WidgetBoundary>
  );
}

function compatible(
  instance: DashboardInstance,
  definition: DashboardWidgetDefinition | undefined
): DashboardInstance | null {
  if (!definition || instance.configVersion !== definition.configVersion) {
    return null;
  }
  try {
    return {
      ...instance,
      config: definition.configSchema.parse(instance.config),
    };
  } catch {
    return null;
  }
}

export function DashboardPage(props: ConsoleLocalPageProps<DashboardServices>) {
  // Activation changes reset the authorization projection, not placement changes.
  return (
    <Dashboard
      key={`${props.activation.key}:${props.services.permissionKey}`}
      {...props}
    />
  );
}

function Dashboard({
  services,
  activation,
  signal: parentSignal,
}: ConsoleLocalPageProps<DashboardServices>) {
  // Permission retirement can unmount this child while its host lease stays current.
  // Keep the host activation for contributions, but guard work with the child's signal.
  const { signal } = useConsoleActivation(activation, parentSignal);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [draft, setDraft] = useState<DashboardDraft | null>(null);
  const [, redraw] = useState(0);
  const [editing, setEditing] = useState(false);
  const [layoutOptionsOpen, setLayoutOptionsOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const settingsFocusRef = useRef<HTMLElement | null>(null);
  const addFocusRef = useRef<HTMLElement | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    label: string;
    draft: DashboardDraft | null;
    store: DashboardStore;
    run: () => void;
  } | null>(null);
  const confirmationRef = useRef(confirmation);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const layoutOptionsTriggerRef = useRef<HTMLElement | null>(null);
  const retry = useRef<{
    expectedRevision: string;
    mutationId: string;
    document: DashboardDocument;
  } | null>(null);
  const definitions = useMemo(
    () => definitionMap(services.widgets),
    [services.widgets]
  );
  const { width, containerRef, mounted } = useContainerWidth();
  const narrow = width < 600;
  const document = draft?.document ?? snapshot?.document;
  const restricted = new Set(snapshot?.restrictedInstanceIds);
  const restrictedDefinitions = new Set(
    snapshot?.document.instances
      .filter((instance) => restricted.has(instance.id))
      .map((instance) => definitionKey(instance.definition))
  );
  function mayUseWidget(definition: DashboardWidgetDefinition) {
    return (
      !restrictedDefinitions.has(definitionKey(definition)) &&
      (services.canUseWidget?.(definition) ?? true)
    );
  }

  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) {
      abort();
    }
    signal.addEventListener("abort", abort, { once: true });
    setLoading(true);
    async function read() {
      try {
        const value = await services.store.read({ signal: controller.signal });
        if (!controller.signal.aborted && activation.isCurrent()) {
          setSnapshot(value);
          setDraft(new DashboardDraft(value));
          setError(null);
          setEditing(false);
          setSelected(null);
          retry.current = null;
        }
      } catch (readError) {
        if (!controller.signal.aborted && activation.isCurrent()) {
          setError(message(readError));
        }
      } finally {
        if (!controller.signal.aborted && activation.isCurrent()) {
          setLoading(false);
        }
      }
    }
    void read();
    return () => {
      signal.removeEventListener("abort", abort);
      controller.abort();
    };
  }, [services.store, activation, signal, reload]);

  function change(operation: (value: DashboardDraft) => void) {
    if (
      !draft ||
      runningRef.current ||
      confirmationRef.current ||
      signal.aborted ||
      !activation.isCurrent()
    ) {
      return;
    }
    try {
      operation(draft);
      retry.current = null;
      setError(null);
      redraw((value) => value + 1);
    } catch (changeError) {
      setError(message(changeError));
    }
  }
  async function save() {
    if (
      !draft ||
      !snapshot ||
      runningRef.current ||
      confirmationRef.current ||
      signal.aborted ||
      !activation.isCurrent()
    ) {
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setError(null);
    const input = retry.current ?? {
      expectedRevision: snapshot.revision,
      mutationId: crypto.randomUUID(),
      document: structuredClone(draft.document),
    };
    retry.current = input;
    try {
      const value = await services.store.save(input, { signal });
      if (!signal.aborted && activation.isCurrent()) {
        setSnapshot(value);
        setDraft(new DashboardDraft(value));
        setEditing(false);
        setSelected(null);
        retry.current = null;
      }
    } catch (saveError) {
      if (!signal.aborted && activation.isCurrent()) {
        setError(message(saveError));
      }
    } finally {
      runningRef.current = false;
      if (!signal.aborted && activation.isCurrent()) {
        setRunning(false);
      }
    }
  }
  function requestConfirmation(
    title: string,
    description: string,
    label: string,
    run: () => void,
    returnFocus?: HTMLElement | null
  ) {
    if (
      confirmationRef.current ||
      runningRef.current ||
      loading ||
      signal.aborted ||
      !activation.isCurrent()
    ) {
      return;
    }
    const { activeElement } = globalThis.document;
    returnFocusRef.current =
      returnFocus ??
      (activeElement instanceof HTMLElement ? activeElement : null);
    const pending = {
      title,
      description,
      label,
      draft,
      store: services.store,
      run,
    };
    confirmationRef.current = pending;
    setConfirmation(pending);
  }
  function closeConfirmation() {
    confirmationRef.current = null;
    setConfirmation(null);
  }
  function cancelEditing() {
    const discard = () => {
      if (snapshot) {
        setDraft(new DashboardDraft(snapshot));
      }
      setEditing(false);
      setSelected(null);
      retry.current = null;
      setError(null);
    };
    if (draft?.dirty) {
      requestConfirmation(
        "Discard dashboard edits?",
        "Discard unsaved widget, configuration and layout changes? Your saved dashboard and business data will not change.",
        "Discard edits",
        discard
      );
    } else if (
      !runningRef.current &&
      activation.isCurrent() &&
      !signal.aborted
    ) {
      discard();
    }
  }
  function confirmDraftChange() {
    const pending = confirmationRef.current;
    if (!pending) {
      return;
    }
    closeConfirmation();
    if (
      signal.aborted ||
      !activation.isCurrent() ||
      runningRef.current ||
      loading ||
      pending.draft !== draft ||
      pending.store !== services.store
    ) {
      return;
    }
    pending.run();
  }
  function requestRemoval(instance: DashboardInstance) {
    const definition = definitions.get(definitionKey(instance.definition));
    if (
      restricted.has(instance.id) ||
      !compatible(instance, definition) ||
      (definition && !mayUseWidget(definition))
    ) {
      return;
    }
    const target = structuredClone(instance);
    requestConfirmation(
      "Remove widget?",
      `Remove ${definition?.title ?? "this widget"} from your dashboard draft? This does not delete business data. Save the dashboard to keep this change.`,
      "Remove widget",
      () => {
        change((value) => value.remove(target.id));
        setSelected((current) => (current === target.id ? null : current));
      }
    );
  }
  function add(definition: DashboardWidgetDefinition) {
    change((value) => {
      const id = crypto.randomUUID();
      const row = Math.max(
        0,
        ...value.document.placements.map(
          (placement) => placement.row + placement.height
        )
      );
      value.add(
        {
          id,
          definition: {
            bindingId: definition.bindingId,
            widgetId: definition.widgetId,
          },
          configVersion: definition.configVersion,
          config: definition.configSchema.parse(definition.defaultConfig),
        },
        { instanceId: id, column: 0, row, ...definition.sizes.default }
      );
      setSelected(id);
    });
  }
  function layoutChange(layout: Layout) {
    if (!editing || narrow || !document) {
      return;
    }
    change((value) =>
      value.setLayout(
        layout.map((item) => ({
          instanceId: item.i,
          column: item.x,
          row: item.y,
          width: item.w,
          height: item.h,
        }))
      )
    );
  }
  function canChangeGeometry(
    id: string,
    field: "column" | "row" | "width" | "height",
    delta: number
  ) {
    if (!draft) {
      return false;
    }
    const instance = draft.document.instances.find((item) => item.id === id);
    const placement = draft.document.placements.find(
      (item) => item.instanceId === id
    );
    const definition =
      instance && definitions.get(definitionKey(instance.definition));
    if (!placement) {
      return false;
    }
    const next = { ...placement, [field]: placement[field] + delta };
    if (
      definition &&
      (next.width < definition.sizes.min.width ||
        next.width > definition.sizes.max.width ||
        next.height < definition.sizes.min.height ||
        next.height > definition.sizes.max.height)
    ) {
      return false;
    }
    try {
      const candidate = new DashboardDraft({
        ...draft.base,
        document: draft.document,
      });
      candidate.setLayout(
        draft.document.placements.map((item) =>
          item.instanceId === id ? next : item
        )
      );
      return true;
    } catch {
      return false;
    }
  }
  function geometry(
    id: string,
    field: "column" | "row" | "width" | "height",
    delta: number
  ) {
    change((value) => {
      const instance = value.document.instances.find((item) => item.id === id);
      const definition =
        instance && definitions.get(definitionKey(instance.definition));
      value.setLayout(
        value.document.placements.map((placement) => {
          if (placement.instanceId !== id) {
            return placement;
          }
          const next = { ...placement, [field]: placement[field] + delta };
          if (
            definition &&
            (next.width < definition.sizes.min.width ||
              next.width > definition.sizes.max.width ||
              next.height < definition.sizes.min.height ||
              next.height > definition.sizes.max.height)
          ) {
            throw new Error("Widget size limit reached");
          }
          return next;
        })
      );
    });
  }
  const ordered = [...(document?.placements ?? [])].sort(
    (a, b) => a.row - b.row || a.column - b.column
  );
  let nextRow = 0;
  const layout = ordered.map((placement) => {
    const instance = document?.instances.find(
      (item) => item.id === placement.instanceId
    );
    const definition =
      instance && definitions.get(definitionKey(instance.definition));
    const y = nextRow;
    nextRow += placement.height;
    return {
      i: placement.instanceId,
      x: narrow ? 0 : placement.column,
      y: narrow ? y : placement.row,
      w: narrow ? 1 : placement.width,
      h: placement.height,
      minW: narrow ? 1 : (definition?.sizes.min.width ?? 1),
      maxW: narrow ? 1 : (definition?.sizes.max.width ?? 12),
      minH: definition?.sizes.min.height ?? 1,
      maxH: definition?.sizes.max.height ?? 1000,
      static: restricted.has(placement.instanceId),
    };
  });
  const selectedInstance = document?.instances.find(
    (instance) => instance.id === selected
  );
  const selectedDefinition =
    selectedInstance &&
    definitions.get(definitionKey(selectedInstance.definition));
  const selectedPlacement = document?.placements.find(
    (placement) => placement.instanceId === selected
  );
  const selectedRemovable =
    selectedInstance &&
    selectedDefinition &&
    !restricted.has(selectedInstance.id) &&
    mayUseWidget(selectedDefinition) &&
    compatible(selectedInstance, selectedDefinition);
  const SelectedEditor = selectedRemovable && selectedDefinition?.ConfigEditor;
  const availableWidgets = services.widgets.filter(mayUseWidget);
  const editOptions = (
    <div {...stylex.props(styles.group)}>
      <ConsoleIconButton
        label="Add widget"
        tooltip="Add a widget to this dashboard"
        variant="secondary"
        disabled={running || loading || availableWidgets.length === 0}
        xstyle={styles.cornerButton}
        onClick={() => {
          if (
            signal.aborted ||
            !activation.isCurrent() ||
            runningRef.current ||
            confirmationRef.current
          ) {
            return;
          }
          addFocusRef.current = globalThis.document
            .activeElement as HTMLElement;
          setAdding(true);
        }}
      >
        <span aria-hidden="true">+</span>
      </ConsoleIconButton>
      <Popover.Root
        open={layoutOptionsOpen}
        onOpenChange={setLayoutOptionsOpen}
      >
        <Popover.Trigger
          render={
            <ConsoleIconButton
              label="Dashboard layout options"
              tooltip="Dashboard layout options"
              variant="secondary"
              xstyle={styles.cornerButton}
              disabled={running || loading}
              onClick={(event) => {
                layoutOptionsTriggerRef.current = event.currentTarget;
              }}
            >
              <span aria-hidden="true">⋯</span>
            </ConsoleIconButton>
          }
        />
        <Popover.Portal>
          <Popover.Positioner side="top" align="start" sideOffset={8}>
            <Popover.Popup aria-label="Dashboard layout options">
              <div {...stylex.props(styles.group)}>
                <Button
                  variant="ghost"
                  xstyle={styles.button}
                  disabled={running || !draft?.canUndoLayout}
                  onClick={() => {
                    setLayoutOptionsOpen(false);
                    change((value) => value.undoLayout());
                  }}
                >
                  Undo layout
                </Button>
                <Button
                  variant="ghost"
                  xstyle={styles.button}
                  disabled={running}
                  onClick={(event) => {
                    setLayoutOptionsOpen(false);
                    const returnFocus =
                      layoutOptionsTriggerRef.current ?? event.currentTarget;
                    const defaults = structuredClone(services.defaults);
                    requestConfirmation(
                      "Restore default dashboard?",
                      "Replace this draft with the application's default dashboard? This does not undo business operations. Save the dashboard to keep this change.",
                      "Restore defaults",
                      () => {
                        change((value) => value.restore(defaults));
                        setSelected(null);
                      },
                      returnFocus
                    );
                  }}
                >
                  Restore defaults
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
  return (
    <div {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={activation.key}
        value={{ context: { kind: "object", label: "Dashboard" } }}
      />
      <ConsoleLayout.Corner area="topRight">
        <div {...stylex.props(styles.group)}>
          {editing ? (
            <ConsoleIconButton
              label="Done editing dashboard"
              side="bottom"
              tooltip={
                running
                  ? "Saving dashboard"
                  : draft?.dirty
                    ? "Save dashboard edits"
                    : "Finish editing dashboard"
              }
              variant="primary"
              xstyle={styles.cornerButton}
              disabled={running || loading}
              onClick={() => (draft?.dirty ? void save() : cancelEditing())}
            >
              <span aria-hidden="true">✓</span>
            </ConsoleIconButton>
          ) : (
            <ConsoleIconButton
              label="Edit dashboard"
              side="bottom"
              variant="secondary"
              xstyle={styles.cornerButton}
              disabled={!snapshot || loading}
              onClick={() => {
                if (activation.isCurrent() && !signal.aborted) {
                  setEditing(true);
                }
              }}
            >
              <span aria-hidden="true">✎</span>
            </ConsoleIconButton>
          )}
        </div>
      </ConsoleLayout.Corner>
      {editing && (
        <>
          <ConsoleLayout.Corner area="bottomLeft" xstyle={styles.bottomCorner}>
            {editOptions}
          </ConsoleLayout.Corner>
          <ConsoleLayout.Corner area="bottomRight" xstyle={styles.bottomCorner}>
            <ConsoleIconButton
              label="Cancel dashboard edits"
              tooltip="Discard dashboard edits"
              variant="secondary"
              xstyle={styles.cornerButton}
              disabled={running}
              onClick={cancelEditing}
            >
              <span aria-hidden="true">×</span>
            </ConsoleIconButton>
          </ConsoleLayout.Corner>
        </>
      )}
      {loading && <output>Loading dashboard…</output>}
      {error && (
        <div role="alert" {...stylex.props(styles.status)}>
          <p>
            {error} {draft && "Your draft has not been discarded."}
          </p>
          <Button
            disabled={running}
            xstyle={styles.button}
            onClick={() => {
              const targetReload = reload + 1;
              requestConfirmation(
                "Reload saved dashboard?",
                "Discard your draft and reload the saved dashboard? This does not undo business operations.",
                "Reload dashboard",
                () => setReload(targetReload)
              );
            }}
          >
            Reload saved dashboard
          </Button>
        </div>
      )}
      {editing &&
        selectedInstance &&
        selectedPlacement &&
        selected &&
        !restricted.has(selected) &&
        (!selectedDefinition || mayUseWidget(selectedDefinition)) && (
          <Modal.Root
            open
            onOpenChange={(open) => {
              if (!open) {
                setSelected(null);
              }
            }}
          >
            <Modal.Portal>
              <Modal.Backdrop />
              <Modal.Viewport>
                <Modal.Popup size="sm" finalFocus={settingsFocusRef}>
                  <Modal.Header>
                    <Modal.Title>
                      {selectedDefinition?.title ?? "Unavailable widget"}
                    </Modal.Title>
                    <Modal.Description>
                      Adjust widget layout and configuration.
                    </Modal.Description>
                  </Modal.Header>
                  <section
                    aria-label="Selected widget settings"
                    {...stylex.props(styles.editor)}
                  >
                    <div {...stylex.props(styles.group)}>
                      <Button
                        variant="ghost"
                        disabled={running}
                        xstyle={styles.button}
                        onClick={() => setSelected(null)}
                      >
                        Close settings
                      </Button>
                    </div>
                    <div {...stylex.props(styles.controls)}>
                      {(["column", "row", "width", "height"] as const).map(
                        (field) => (
                          <fieldset
                            key={field}
                            {...stylex.props(
                              styles.group,
                              styles.geometryGroup
                            )}
                          >
                            <legend>Widget {field}</legend>
                            <Button
                              variant="ghost"
                              xstyle={styles.button}
                              disabled={
                                running ||
                                !canChangeGeometry(selected, field, -1)
                              }
                              aria-label={`Decrease ${field}`}
                              onClick={() => geometry(selected, field, -1)}
                            >
                              −
                            </Button>
                            <span>{selectedPlacement[field]}</span>
                            <Button
                              variant="ghost"
                              xstyle={styles.button}
                              disabled={
                                running ||
                                !canChangeGeometry(selected, field, 1)
                              }
                              aria-label={`Increase ${field}`}
                              onClick={() => geometry(selected, field, 1)}
                            >
                              +
                            </Button>
                          </fieldset>
                        )
                      )}
                    </div>
                    {SelectedEditor &&
                      selectedRemovable &&
                      selectedDefinition && (
                        <SelectedEditor
                          config={selectedRemovable.config}
                          onChange={(config) =>
                            change((value) =>
                              value.configure(
                                selected,
                                selectedDefinition.configSchema.parse(config)
                              )
                            )
                          }
                        />
                      )}
                  </section>
                </Modal.Popup>
              </Modal.Viewport>
            </Modal.Portal>
          </Modal.Root>
        )}
      {document?.instances.length === 0 && !loading && (
        <p>No widgets yet. Edit the dashboard to add an available widget.</p>
      )}
      <div ref={containerRef} {...stylex.props(styles.grid)}>
        {mounted && (
          <GridLayout
            signal={signal}
            width={width}
            layout={layout}
            compactor={noCompactor}
            gridConfig={{
              cols: narrow ? 1 : dashboardLimits.columns,
              rowHeight: 64,
              margin: [12, 12],
              maxRows: dashboardLimits.rows,
            }}
            dragConfig={{
              enabled: editing && !running && !narrow,
              handle: "[data-dashboard-drag]",
              allowMobileScroll: true,
            }}
            resizeConfig={{ enabled: editing && !running && !narrow }}
            onDragStop={layoutChange}
            onResizeStop={layoutChange}
          >
            {ordered.map((placement) => {
              const instance = document?.instances.find(
                (item) => item.id === placement.instanceId
              );
              if (!instance) {
                return null;
              }
              const definition = definitions.get(
                definitionKey(instance.definition)
              );
              const hidden =
                restricted.has(instance.id) ||
                (!!definition && !mayUseWidget(definition));
              const allowed = !hidden && definition;
              const admitted = allowed
                ? compatible(instance, definition)
                : null;
              return (
                <div
                  key={instance.id}
                  {...stylex.props(
                    styles.card,
                    editing && styles.editingCard,
                    selected === instance.id && styles.selected
                  )}
                >
                  <div
                    {...stylex.props((editing || !admitted) && styles.header)}
                  >
                    <h2
                      {...stylex.props(
                        styles.title,
                        admitted && styles.hiddenTitle
                      )}
                    >
                      {hidden
                        ? "Restricted widget"
                        : (definition?.title ?? "Unavailable widget")}
                    </h2>
                    {editing && !hidden && (
                      <>
                        <Button
                          variant="ghost"
                          xstyle={[styles.button, styles.handle]}
                          data-dashboard-drag
                          disabled={running}
                          onClick={() => {
                            settingsFocusRef.current = globalThis.document
                              .activeElement as HTMLElement;
                            setSelected(instance.id);
                          }}
                          aria-label={`Edit ${definition?.title ?? "unavailable widget"}`}
                          aria-pressed={selected === instance.id}
                        >
                          {definition?.title ?? "Widget"}{" "}
                          <span aria-hidden="true">⠿</span>
                        </Button>
                        <Button
                          variant="ghost"
                          xstyle={[styles.button, styles.remove]}
                          aria-label={`Remove ${definition?.title ?? "unavailable widget"}`}
                          disabled={running || !admitted}
                          onClick={() => requestRemoval(instance)}
                        >
                          <span aria-hidden="true">−</span>
                        </Button>
                      </>
                    )}
                  </div>
                  <div {...stylex.props(styles.content)}>
                    {admitted && definition ? (
                      <ActiveWidget
                        key={canonicalJson([
                          instance.id,
                          instance.definition,
                          admitted.config,
                          instance.configVersion,
                          services.permissionKey,
                        ])}
                        instance={admitted}
                        definition={definition}
                        parent={activation}
                        parentSignal={signal}
                      />
                    ) : (
                      <p>
                        Widget unavailable. Its saved configuration is retained.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </GridLayout>
        )}
      </div>
      <Modal.Root open={adding} onOpenChange={setAdding}>
        <Modal.Portal>
          <Modal.Backdrop />
          <Modal.Viewport>
            <Modal.Popup size="sm" finalFocus={addFocusRef}>
              <Modal.Header>
                <Modal.Title>Add widget</Modal.Title>
                <Modal.Description>
                  Choose a widget to add to your dashboard draft.
                </Modal.Description>
              </Modal.Header>
              <div {...stylex.props(styles.widgetChoices)}>
                {availableWidgets.map((widget) => (
                  <Button
                    key={definitionKey(widget)}
                    disabled={running}
                    xstyle={styles.widgetChoice}
                    onClick={() => {
                      add(widget);
                      setAdding(false);
                    }}
                  >
                    Add {widget.title}
                  </Button>
                ))}
                {availableWidgets.length === 0 && (
                  <p>No widgets are available with your current permissions.</p>
                )}
              </div>
              <Modal.Footer>
                <Button onClick={() => setAdding(false)}>Cancel</Button>
              </Modal.Footer>
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal.Root>
      <Modal.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeConfirmation();
          }
        }}
      >
        <Modal.Portal>
          <Modal.Backdrop />
          <Modal.Viewport>
            <Modal.Popup size="sm" finalFocus={returnFocusRef}>
              <Modal.Header>
                <Modal.Title>{confirmation?.title}</Modal.Title>
                <Modal.Description>
                  {confirmation?.description}
                </Modal.Description>
              </Modal.Header>
              <Modal.Footer>
                <Button onClick={closeConfirmation}>Cancel</Button>
                <Button onClick={confirmDraftChange}>
                  {confirmation?.label}
                </Button>
              </Modal.Footer>
            </Modal.Popup>
          </Modal.Viewport>
        </Modal.Portal>
      </Modal.Root>
    </div>
  );
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "Dashboard operation failed.";
}

export const dashboardPlugin = defineConsolePlugin<DashboardServices>({
  id: "dashboard",
  pages: { dashboard: { title: "Dashboard", component: DashboardPage } },
  navigation: [{ id: "dashboard", label: "Dashboard", page: "dashboard" }],
});

export function bindDashboard(options: {
  id: string;
  route: string;
  services: DashboardServices;
}) {
  return bindConsole(dashboardPlugin, {
    id: options.id,
    routes: { dashboard: options.route },
    services: options.services,
  });
}
