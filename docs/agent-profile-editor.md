# Agent Profile editor

Status: proposed architecture; named Profile editing is not implemented by the current settings page.

## Product structure

Keep Agent selection above the editor. Select a Profile within that Agent, then edit its Tools, MCP servers, Skills, and Instrument providers in separate tabs. Each tab has search, enabled/available counts, Enable all, Disable all, and individual controls. Bulk controls act on the whole tab, independent of filtering. Keep one shared draft, Reset, and Save changes across tabs.

General Agent settings retain authentication and storage. Profile configuration does not silently modify Agent-wide Tool policy. Plugin configuration remains in the Plugin workbench, linked from each provider row.

## Ownership and persistence

A named Profile stores selected Plugin instances, bindings, and profile-specific Tool grants. MCP servers, Skills, and Instruments are provider instances discovered from descriptors, not inferred from display names. Disabling a provider removes it from the candidate Profile; it does not uninstall its Plugin or delete credentials.

The Agent owns Profile inventory, read, revision-checked update, validation, and activation APIs. Console edits a draft and submits a complete candidate with its expected revision. The SQLite management mode must persist named Profile revisions; a change to the current runtime configuration is not equivalent to saving a Profile file.

Saving an inactive Profile must not activate it. Saving an active Profile produces a new immutable Plan/Generation for subsequent work; existing turns retain their resolved Plan. Failed validation or revision conflicts keep the draft and leave the active configuration unchanged. Credentials stay in their owning secret store.

## First implementation slice

1. Expose Profile inventory and revisioned read/write through the Agent control surface and Console proxy.
2. Add clone and edit for existing Profiles; preserve unknown fields and custom Profiles.
3. Support Tools and provider-instance selection for MCP, Skills, and Instruments with one atomic save.
4. Preview invalid or missing bindings before save, and separate Save from Activate.
5. Verify round-trip persistence, inactive Profile isolation, concurrent edit conflicts, and old-turn/new-turn boundaries.

## Delivered settings improvements

The present Tool access editor is explicitly Agent-wide. It supports search, bulk enable/disable, a local draft, Reset, revision-checked Save, and conflict detection. General and Guidance & integrations use section navigation; Open Agent and All Plugins live in an actions menu. These changes do not claim Profile-specific persistence.
