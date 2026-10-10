import type { DashboardDocument, DashboardSnapshot } from "./contract";
import { canonicalJson, validateDocument } from "./validation";

export type DashboardPlacement = DashboardDocument["placements"][number];
export type DashboardInstance = DashboardDocument["instances"][number];

/** Layout undo never resurrects removed instances or overwrites configuration. */
export class DashboardDraft {
  document: DashboardDocument;
  private layouts: DashboardDocument["placements"][] = [];
  readonly base: DashboardSnapshot;
  constructor(base: DashboardSnapshot) {
    this.base = base;
    this.document = structuredClone(base.document);
  }
  get dirty(): boolean {
    return canonicalJson(this.document) !== canonicalJson(this.base.document);
  }
  get canUndoLayout(): boolean {
    return this.layouts.length > 0;
  }
  setLayout(placements: DashboardDocument["placements"]): void {
    const next = { ...this.document, placements: structuredClone(placements) };
    validateDocument(next);
    if (canonicalJson(placements) === canonicalJson(this.document.placements)) {
      return;
    }
    this.layouts.push(structuredClone(this.document.placements));
    this.document = next;
  }
  undoLayout(): void {
    const previous = this.layouts.pop();
    if (!previous) {
      return;
    }
    const ids = new Set(this.document.instances.map((instance) => instance.id));
    const oldIds = new Set(previous.map((placement) => placement.instanceId));
    const document = {
      ...this.document,
      placements: [
        ...previous.filter((placement) => ids.has(placement.instanceId)),
        ...this.document.placements.filter(
          (placement) => !oldIds.has(placement.instanceId)
        ),
      ],
    };
    validateDocument(document);
    this.document = document;
  }
  add(instance: DashboardInstance, placement: DashboardPlacement): void {
    const document = {
      ...this.document,
      instances: [...this.document.instances, structuredClone(instance)],
      placements: [...this.document.placements, structuredClone(placement)],
    };
    validateDocument(document);
    this.document = document;
  }
  remove(id: string): void {
    this.document = {
      ...this.document,
      instances: this.document.instances.filter(
        (instance) => instance.id !== id
      ),
      placements: this.document.placements.filter(
        (placement) => placement.instanceId !== id
      ),
    };
  }
  configure(id: string, config: DashboardInstance["config"]): void {
    const document = {
      ...this.document,
      instances: this.document.instances.map((instance) =>
        instance.id === id ? { ...instance, config } : instance
      ),
    };
    validateDocument(document);
    this.document = structuredClone(document);
  }
  restore(defaults: DashboardDocument): void {
    validateDocument(defaults);
    this.layouts.push(structuredClone(this.document.placements));
    this.document = structuredClone(defaults);
  }
}
