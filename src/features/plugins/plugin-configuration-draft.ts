export type PluginConfigurationSource = {
  sourceDigest: string;
  toml: string;
};

export type PluginConfigurationDraft = {
  base: PluginConfigurationSource;
  dirty: boolean;
  value: string;
};

export type PluginConfigurationDrafts = Readonly<
  Record<string, PluginConfigurationDraft>
>;

export function cleanPluginConfigurationDraft(
  source: PluginConfigurationSource
): PluginConfigurationDraft {
  return { base: source, dirty: false, value: source.toml };
}

export function reconcilePluginConfigurationDraft(
  draft: PluginConfigurationDraft | undefined,
  source: PluginConfigurationSource
): PluginConfigurationDraft {
  if (!draft) {
    return cleanPluginConfigurationDraft(source);
  }
  if (!draft.dirty) {
    return draft.base.sourceDigest === source.sourceDigest &&
      draft.value === source.toml
      ? draft
      : cleanPluginConfigurationDraft(source);
  }
  if (draft.value === source.toml) {
    return cleanPluginConfigurationDraft(source);
  }
  return draft;
}

export function editPluginConfigurationDraft(
  draft: PluginConfigurationDraft | undefined,
  source: PluginConfigurationSource,
  value: string
): PluginConfigurationDraft {
  const current = reconcilePluginConfigurationDraft(draft, source);
  if (value === source.toml) {
    return cleanPluginConfigurationDraft(source);
  }
  return { ...current, dirty: true, value };
}

export function reviewPluginConfigurationDraft(
  source: PluginConfigurationSource,
  value: string
): PluginConfigurationDraft {
  return value === source.toml
    ? cleanPluginConfigurationDraft(source)
    : { base: source, dirty: true, value };
}

export function pluginConfigurationDraftHasExternalChange(
  draft: PluginConfigurationDraft,
  source: PluginConfigurationSource
) {
  return (
    draft.dirty &&
    draft.base.sourceDigest !== source.sourceDigest &&
    draft.value !== source.toml
  );
}

export function reconcilePluginConfigurationDrafts(
  drafts: PluginConfigurationDrafts,
  draftKey: string,
  source: PluginConfigurationSource
): PluginConfigurationDrafts {
  const current = drafts[draftKey];
  const reconciled = reconcilePluginConfigurationDraft(current, source);
  return reconciled === current
    ? drafts
    : { ...drafts, [draftKey]: reconciled };
}

export function editPluginConfigurationDrafts(
  drafts: PluginConfigurationDrafts,
  draftKey: string,
  source: PluginConfigurationSource,
  value: string
): PluginConfigurationDrafts {
  return {
    ...drafts,
    [draftKey]: editPluginConfigurationDraft(drafts[draftKey], source, value),
  };
}

export class PluginConfigurationDraftStore {
  private readonly drafts = new Map<string, PluginConfigurationDraft>();
  private readonly listeners = new Map<string, Set<() => void>>();

  get(draftKey: string) {
    return this.drafts.get(draftKey);
  }

  subscribe(draftKey: string, listener: () => void) {
    const listeners = this.listeners.get(draftKey) ?? new Set();
    listeners.add(listener);
    this.listeners.set(draftKey, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(draftKey);
      }
    };
  }

  set(
    draftKey: string,
    source: PluginConfigurationSource,
    update: (
      current: PluginConfigurationDraft | undefined
    ) => PluginConfigurationDraft
  ) {
    const current = this.drafts.get(draftKey);
    const next = update(current);
    if (next === current) {
      return;
    }
    if (next.dirty) {
      this.drafts.set(draftKey, next);
    } else {
      if (!current && next.value === source.toml) {
        return;
      }
      this.drafts.delete(draftKey);
    }
    this.notify(draftKey);
  }

  reconcile(draftKey: string, source: PluginConfigurationSource) {
    const current = this.drafts.get(draftKey);
    if (!current) {
      return;
    }
    const next = reconcilePluginConfigurationDraft(current, source);
    if (next.dirty) {
      return;
    }
    this.drafts.delete(draftKey);
    this.notify(draftKey);
  }

  discardPrefix(prefix: string) {
    for (const draftKey of this.drafts.keys()) {
      if (draftKey.startsWith(prefix)) {
        this.drafts.delete(draftKey);
        this.notify(draftKey);
      }
    }
  }

  retainKeys(keys: ReadonlySet<string>) {
    for (const draftKey of this.drafts.keys()) {
      if (!keys.has(draftKey)) {
        this.drafts.delete(draftKey);
        this.notify(draftKey);
      }
    }
  }

  private notify(draftKey: string) {
    for (const listener of this.listeners.get(draftKey) ?? []) {
      listener();
    }
  }
}
