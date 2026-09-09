## @lenso/console-web@0.1.7

## 1.5.2

### Patch Changes

- 1776f4c: Expand Simplified Chinese localization across navigation, Plugin configuration, Profiles, connections, and Agent controls. Preserve user content and technical identifiers when switching languages.

## 1.5.1

### Patch Changes

- eece65d: Clarify Plugin management targets with a grouped selector, retain per-App list filters, and organize Plugin details around configuration. Improve Profile list hierarchy and distinguish editing definitions from applying them to an Agent.

## 1.5.0

### Minor Changes

- b1c52b9: Add named MCP connections from Connections using remote HTTP endpoints or local commands. Validate configuration and publish through the existing revision-checked Plugin workflow, preserving drafts on failure and rejecting duplicate names.
- 5d4ea75: Support parallel project workspaces, simplify Agent task controls and change review, and share image and text attachments across full-page and mini Agent conversations. Preserve attachment references in history and show explicit errors when an attachment cannot be restored.
- b1c52b9: Unify rich Markdown composers, slash commands, context references, and Profile Skill selection across Agent surfaces. Show ordered turn activity with compact tool details and readable errors, collapse completed work, and branch completed replies into durable chats with source links.
- b1c52b9: Add dedicated Agent Profile list and edit pages with template duplication, instructions, searchable capability lists, and bulk enable/disable controls. Save drafts in the editor and activate Profiles explicitly from the list, with revision conflict handling and unsaved-navigation protection.

  Keep Agent-wide permissions in Agent settings and provider configuration in the Plugin workbench.

### Patch Changes

- b1c52b9: Prefer browser ChatGPT sign-in on localhost while retaining device-code sign-in for remote Hosts and callback-port conflicts. Open the authorization window from the user gesture and retain the manual continuation link when popups are blocked.
- b1c52b9: Simplify Settings into Preferences, Profiles, and Connections. Move global tool restrictions to an advanced entry, show blocked tools accurately in Profile editing, and distinguish instruction sources from custom instructions. Preserve legacy settings URLs through redirects.

## 1.4.0

### Minor Changes

- e7fd211: Show the selected Agent's working directory with Agent-scoped task creation and history. Add recorded task Changes with earlier snapshots and truncation indicators, and keep task navigation usable on narrow screens. Directory context requires Lenso Agent 0.1.7; older Agents remain compatible. Accept Session instruction revision events when switching coding Profiles.

## 1.3.0

### Minor Changes

- 1489e3d: Add Agent-scoped coding setup for SQLite-managed Profile import, environment validation, explicit Tool authorization, and Plan/Code selection. Refresh runtime catalogs after Profile changes and persist App Agent Tool policy in the source launcher. Requires Lenso Agent 0.1.4 or newer.

## 1.2.0

### Minor Changes

- 5a1a8e1: Connect Agent settings to the selected Agent's Plugin configuration and live
  context catalog. Replace placeholder guidance, skill creation, MCP access and
  billing controls with provider-owned settings and explicit availability states.
  Keep App Agent Tool access read-only without exposing Host control endpoints.
  Align Agent settings with Preferences using shared page styles and Lenso UI
  settings rows, consistent grouping, spacing and explicit empty/error states.
- 4d2f003: Add negotiated Agent controls for model, reasoning effort, service tier, mode,
  per-Turn Tool scope, Session compaction and rename, queued prompts, child-task
  supervision, reliable scroll follow, and Web-scoped Context Source suggestions.
  Add Web Terminal command discovery, slash suggestions, cancellable execution,
  and streamed command output backed by the active App Generation.
- 53d820d: Manage capability-owned account connections from Agent settings, including sign-in progress, cancellation, and disconnect. Keep authentication management separate from chat and Plugin configuration permissions.
- 14364db: Remove the retired Console service, Story, dynamic Module UI, Access, and
  Composition architecture. Keep the Console focused on Agent conversations,
  trajectory, history, preferences, and Harness-backed Tool Policy controls.
- c4e3067: Show unsaved configuration changes, allow discarding local edits without changing Host configuration, and protect drafts when leaving or refreshing the Plugin page. Fields and Advanced continue to share the same draft.
- 8465831: Show configuration field ownership states and restore individual inherited values without rewriting sibling defaults. Present native input constraint errors beside editable fields while preserving authority-owned validation at proposal time.
- 7fd8680: Group configuration fields using titled allOf schema branches, with searchable section headings and unchanged configuration values.
- 79ca7ed: Search configuration fields by schema name, path, title and description while retaining their object groups and editing state. Stored values are never searched.
- 8eff34b: Edit multiline Plugin configuration strings directly in Fields. Existing multiline text and multiline paste use a Lenso UI text area, and single-line fields can be expanded without changing their values.
- 8045d66: Render locally referenced and nullable configuration schemas in Fields, retaining Advanced editing for unresolved or recursive references. Nullable fields edit the concrete value without inventing a TOML null representation.

  Add explicit oneOf/anyOf form selection using Lenso UI. Selecting a variant writes only required constants and preserves other configuration fields; protected and unsupported variants remain in Advanced.

- f1e6e01: Let a Harness launch Console as its Web UI and switch Agent conversations
  between the connected Harness and Console's private Agent. Preserve production
  Tab styling by declaring the CSS layer order before generated stylesheets.
- 1d3b7ea: Replace the built-in/connected mode switch with catalog-derived full Agent
  identities. Qualify Session navigation and caches by the owning Agent while
  preserving separate Console Agent and App Agent state.

  Make the Console Host select a durable SQLite configuration authority for the
  Console Agent, including revision-fenced publication, history, rollback, and
  restart recovery instead of browser-owned configuration state. Keep the
  separate managed App outside that authority until it supplies an explicit
  configuration Capability. Allow an App Agent Host to opt into
  `lenso.agent.plugin-configuration@1`, route only that bounded control contract
  through Console, and scope Plugin workbench requests and caches to the selected
  Agent.

  Let the reference App Agent Host explicitly select local, durable SQLite, or
  remote Plugin configuration authority while keeping custom authority injection
  at the embedding Host boundary.

- 8b7fb06: Group Agent integrations by provided capabilities instead of known Plugin package
  names. Support read-only and write-only configuration fields and conditional
  if/then/else object fields, preserving inactive values. Direct unsupported or
  ambiguous schema compositions to Advanced instead of guessing their controls.
- 923d469: Separate Plugin management into App plugins, Console extensions, and Management Agent scopes. Add explicit non-Agent App management connections, preserve target-specific configuration authority, and use shared Select and TextField components for filtering.
- 06249e7: Edit typed configuration arrays and dynamic object keys with native field controls. Preserve array ordering and string whitespace, prevent duplicate-key overwrites, and keep sensitive collection values out of input hydration.
- d0541de: Show independently verified desired, preparing, active, rejected, and rolled
  back Plugin Generation state, with Plugin Root revision-aware invalidation,
  cursor-aware updates, and observable control operation receipts.

### Patch Changes

- d55996b: Render Agent turn controls with the shared Lenso Select surface so model,
  reasoning, service-tier, and mode menus match the adjacent Skills control.
- 77b7e2e: Consume the complete Generation-frozen Agent model catalog, omit hidden models
  from ordinary selection, and retain an explicitly selected hidden model.
- 8b66e30: Refine the two-level Console sidebar with independent scrolling and aligned sticky search controls, and consolidate Agent composer run configuration into compact searchable menus with an improved slash command palette.
- ad7372a: Adopt reusable Settings Section and Prompt Composer recipes across Console settings and Agent surfaces while preserving Enter-to-submit and IME-safe composer behavior.
- dd6aa33: Render conditional configuration properties declared with unrestricted boolean schemas, retaining inactive values when switching options.
- 2b8766b: Forward authorized App Agent Profile requests, keep runtime and Plugin management errors visible, and allow explicit App Agent Profile and Tool grants in the local launcher.
- 99c3a39: Upgrade Console to the latest Lenso UI and token packages, and adopt the latest
  Page Layout template with a persistent global rail, contextual navigation,
  compact-screen disclosure, and stable application utilities.

## 1.1.0

### Minor Changes

- fc81759: Add a read-only Module Workbench inspector for receipt-bound identity, execution evidence, permissions, and removal impact previews.

## 1.0.9

### Patch Changes

- acdfaec: Present source-specific Story execution evidence, including safely captured Provider request and response bodies, and correct the Inspector close control, command palette positioning, and Services table consistency.

## 1.0.8

### Patch Changes

- 6a3f561: Build amd64 and arm64 Console Service images concurrently on native runners.

## 1.0.7

### Patch Changes

- 2c7043a: Expose complete, partial, disabled, and unavailable execution-log coverage in Story Inspector, including source gaps and actionable empty states.
- 2c7043a: Restore Story Inspector payload, log, and technical-operation evidence through Story-owned, correlation-scoped endpoints with membership validation and recursive sensitive-data redaction.

## 1.0.6

### Patch Changes

- 950dbe3: Keep direct Module Surface links in a loading or unavailable state until the connected System's Managed Service Context has been resolved. Console now defers loading the surface artifact until that authority context is known.

  Publish the Console Service image for both AMD64 and ARM64 so local development can use the native architecture instead of emulation.

## 1.0.5

### Patch Changes

- 43e9055: Keep Console-owned Story and Services surfaces visible for connected Systems without requiring separately reconciled dynamic artifacts. Linked Module surfaces may now bind to an enrolled owner Service, so Auth requests keep targeting the Host even when another Service is selected.

## 1.0.4

### Patch Changes

- 9b5b635: Keep Modules without a runtime observation unmanaged instead of reporting a false connected state, and expose missing Auth or Story Console UI artifacts as actionable Surface availability failures.

## 1.0.3

### Patch Changes

- 00d2f6d: Remove the Support Ticket business Surface from the Console host and standardize Console API errors on RFC 9457 Problem Details.

## 1.0.2

### Patch Changes

- c921e3f: Normalize OpenAPI operation method keys before selecting read or write Surface Gateway authorization.

## 1.0.1

### Patch Changes

- 866afd7: Bind Surface Gateway operations to exact runtime-provided OpenAPI artifacts and remove module-specific Business API adapters from the Console host.

## 1.0.0

### Major Changes

- ada8c12: Retire generic Console administration contracts and require Module-owned
  Business API operations for Console data and cross-Module actions.

### Patch Changes

- 24f3b56: Expose the public System Connection projection used to compose Console Module
  Surfaces from an exact System topology and Management Binding.
- 9dfd4be: Accept server-trusted signed Service enrollment receipts and require their exact
  identity, policy, and authenticated local Core binding before connecting a System.
- ce78ac7: Expose typed workload observations, asynchronous operations, and stable Workload
  References through the Console Host API and Services inspector.
- 9dfd4be: Project current-actor capabilities per Managed Service and keep Provider target
  origins server-only in Console Service responses.
- 9dfd4be: Expose explicit Console Surface unavailability reasons and prove the distinct
  Surface Grant and connected Module authorization boundaries.
- 508cdc7: Add the digest-bound Console Surface Gateway contract and Support Ticket Module
  Surface for typed list, create, update, and close operations.

## 0.1.9

### Patch Changes

- a6749bd: Allow the statically served TanStack Start bootstrap script through a
  content-hashed Content-Security-Policy so the Console Service can hydrate and
  authenticate in a real browser.

## 0.1.8

### Patch Changes

- 1c2cc9d: Release the current Console module and UI contracts together with the Console Service image.

### Fixes

Close the Console architecture migration by hosting only operator workflows,
loading Module UI artifacts in isolated frames through the digest-bound bridge,
and removing the retired same-origin Console package system.

## @lenso/console@0.1.6

### Features

Add an explicit `console.superadmin` authority marker that grants the current
Console operator access across the capabilities exposed by the Console Service.

### Fixes

Correct authenticated Console data routes and ignore failed duplicate module
registrations so Runtime Stories remains available when a disabled module is
also present in the registry.

## @lenso/console@0.1.5

### Features

Ship the redesigned operator workbench and the matching host-provided extension
components, theme tokens, workspace navigation, and light-mode contract.

### Fixes

Align Story inspectors and Module surfaces, expose grouped Auth workspaces in the
development host, and deduplicate admin-action evidence on Home.

## @lenso/console@0.1.4

### Fixes

Republish the Console package API with its built artifacts and advance the
Console Service OCI image to the matching immutable version.

## @lenso/console@0.1.3

### Features

Publish the independently operated Lenso Console Service with explicit Operator
bootstrap, password-authenticated sessions, governed OCI delivery, and the renamed
Console package API contract.

## @lenso/runtime-console@0.1.2

### Features

Publish the completed M6 delivery, extraction, Service, Story, and operations
surfaces as the reviewed Runtime Console artifact.
