import { describe, expect, it } from "vitest";

import {
  cleanPluginConfigurationDraft,
  editPluginConfigurationDraft,
  editPluginConfigurationDrafts,
  pluginConfigurationDraftHasExternalChange,
  PluginConfigurationDraftStore,
  reconcilePluginConfigurationDraft,
  reconcilePluginConfigurationDrafts,
  reviewPluginConfigurationDraft,
  type PluginConfigurationSource,
} from "./plugin-configuration-draft";

const sourceA = source("A", "source-a");
const sourceC = source("C", "source-c");

describe("Plugin configuration drafts", () => {
  it("follows Host updates while clean", () => {
    expect(
      reconcilePluginConfigurationDraft(
        cleanPluginConfigurationDraft(sourceA),
        sourceC
      )
    ).toEqual(cleanPluginConfigurationDraft(sourceC));
  });

  it("preserves a dirty draft across an exact Host source change", () => {
    const draft = editPluginConfigurationDraft(undefined, sourceA, "B");

    expect(reconcilePluginConfigurationDraft(draft, sourceC)).toEqual(draft);
    expect(pluginConfigurationDraftHasExternalChange(draft, sourceC)).toBe(
      true
    );
  });

  it("does not mistake returning to the old base value for a clean draft", () => {
    const draftB = editPluginConfigurationDraft(undefined, sourceA, "B");
    const draftA = editPluginConfigurationDraft(draftB, sourceC, "A");

    expect(draftA).toMatchObject({ dirty: true, value: "A" });
    expect(pluginConfigurationDraftHasExternalChange(draftA, sourceC)).toBe(
      true
    );
  });

  it("clears a conflict when the editor matches the current Host value", () => {
    const draft = editPluginConfigurationDraft(undefined, sourceA, "B");

    expect(editPluginConfigurationDraft(draft, sourceC, "C")).toEqual(
      cleanPluginConfigurationDraft(sourceC)
    );
  });

  it("treats absent and byte-empty sources as different exact bases", () => {
    const absent = source("", "source-absent");
    const emptyFile = source("", "source-empty-file");
    const draft = editPluginConfigurationDraft(
      undefined,
      absent,
      "enabled = true"
    );

    expect(pluginConfigurationDraftHasExternalChange(draft, emptyFile)).toBe(
      true
    );
  });

  it("anchors a reviewed rollback value to the exact current source", () => {
    expect(reviewPluginConfigurationDraft(sourceC, "rollback = true")).toEqual({
      base: sourceC,
      dirty: true,
      value: "rollback = true",
    });
  });

  it("persists reconciliation so a matched draft cannot reappear later", () => {
    let drafts = editPluginConfigurationDrafts(
      {},
      "example.echo/default",
      sourceA,
      "B"
    );
    drafts = reconcilePluginConfigurationDrafts(
      drafts,
      "example.echo/default",
      source("B", "source-b")
    );
    drafts = reconcilePluginConfigurationDrafts(
      drafts,
      "example.echo/default",
      sourceC
    );

    expect(drafts["example.echo/default"]).toEqual(
      cleanPluginConfigurationDraft(sourceC)
    );
  });

  it("keeps each Instance draft when selection moves away and back", () => {
    let drafts = editPluginConfigurationDrafts(
      {},
      "example.a/default",
      sourceA,
      "draft-a"
    );
    drafts = editPluginConfigurationDrafts(
      drafts,
      "example.b/default",
      sourceC,
      "draft-b"
    );

    expect(drafts["example.a/default"]?.value).toBe("draft-a");
    expect(drafts["example.b/default"]?.value).toBe("draft-b");
  });

  it("notifies only the edited Instance subscription", () => {
    const store = new PluginConfigurationDraftStore();
    let aRenders = 0;
    let bRenders = 0;
    store.subscribe("example.a/default", () => {
      aRenders += 1;
    });
    store.subscribe("example.b/default", () => {
      bRenders += 1;
    });

    store.set("example.a/default", sourceA, (current) =>
      editPluginConfigurationDraft(current, sourceA, "draft-a")
    );

    expect(aRenders).toBe(1);
    expect(bRenders).toBe(0);
  });

  it("retains only dirty drafts and discards removed package state", () => {
    const store = new PluginConfigurationDraftStore();

    store.set("example.a/default", sourceA, (current) =>
      editPluginConfigurationDraft(current, sourceA, "draft-a")
    );
    store.set("example.b/default", sourceC, (current) =>
      editPluginConfigurationDraft(current, sourceC, sourceC.toml)
    );

    expect(store.get("example.a/default")?.value).toBe("draft-a");
    expect(store.get("example.b/default")).toBeUndefined();

    store.discardPrefix("example.a/");
    expect(store.get("example.a/default")).toBeUndefined();
  });

  it("drops drafts after an externally removed Instance leaves verified state", () => {
    const store = new PluginConfigurationDraftStore();
    store.set("example.a/default", sourceA, (current) =>
      editPluginConfigurationDraft(current, sourceA, "draft-a")
    );
    store.set("example.b/default", sourceC, (current) =>
      editPluginConfigurationDraft(current, sourceC, "draft-b")
    );

    store.retainKeys(new Set(["example.b/default"]));

    expect(store.get("example.a/default")).toBeUndefined();
    expect(store.get("example.b/default")?.value).toBe("draft-b");
  });
});

function source(toml: string, sourceDigest: string): PluginConfigurationSource {
  return { sourceDigest, toml };
}
