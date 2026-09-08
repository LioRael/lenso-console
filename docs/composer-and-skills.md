# Composer and Profile Skills

Delivered locally on 2026-09-09 in the Console and Agent `feat/profile-editor` worktrees.

## Interaction model

- `/` searches real commands, enabled Skills, argument-free MCP prompts, formatting, available models/reasoning, and the main Agent's terminal catalog. Arrow keys navigate; Enter/Tab selects; Escape dismisses. Commands change configuration or open their owning page. Skills become removable context chips and are resolved on the Agent before execution.
- `@` attaches files/images, a bounded text snapshot of a selected folder, or published MCP resources. Selection is explicit. Folder snapshots exclude hidden/build/dependency directories, skip binary content, and report size omissions. Browser tabs and third-party conversations are not advertised without a corresponding integration.
- The context ring reports the latest measured model input against the selected model's reported input limit, plus a UTF-8 draft estimate. It does not sum usage across a session. Missing measurements and post-compaction usage remain unknown until reported again. Attachments and newly selected references are not included in the draft estimate.
- Markdown is the storage and request format. The shared rich editor renders headings, emphasis, links, lists, tasks, code blocks, quotes and tables while editing. Enter sends prose; Shift+Enter inserts a line break; lists/code/tables retain Enter for editing; Ctrl/Cmd+Enter sends. IME composition never submits.
- Mini Agent uses the same editor, context chips, attachments, command picker, approval controls, model controls and context meter. Mode changes are in `/`; configuration and long-form work belong in the full page. The old Skills button and inert chat-options button are removed. Menus remain clickable above the compact composer in dark mode and narrow windows.

## Skill ownership

Profiles store `allowed_skills`: omitted means all common Skills, including future additions at the next preparation; an empty array means none. Selecting a subset filters discovery, prompt contribution, context catalogs and tool reads. The Skills Plugin owns loading and immutable snapshots; the Host applies Profile policy before readiness.

Common roots include `~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`, `.agents/skills` and `.claude/skills`. Earlier roots win on duplicate names. Existing filesystem confinement remains enforced. The Profile editor supports search, individual selection, enable/disable all, and enable/disable matching results. Built-in templates remain read-only and can be duplicated.

Expanded context and original user text are stored separately. History displays the original text; model replay retains full context; approval evaluates the original request.

## UI review

Reviewed the main Agent, mini Agent, Preferences, Profiles/editor, Connections, Plugin inventory and Plugin configuration. Kept the established sidebar ownership and neutral Lenso tokens. Fixed command selection colors, menu icon shrinkage, Profile field alignment and long descriptions, compact-menu clipping, and the mini panel disappearing at narrow widths. MCP creation now opens a focused dialog from its section header; Skill configuration fields use the Plugin's existing groups.

References: [Linear Agent](https://linear.app/docs/linear-agent), [Linear documents](https://linear.app/docs/documents), and [Linear integration directory](https://linear.app/docs/integration-directory). The relevant patterns were command-led discovery, explicit context, compact chat, and settings organized by ownership.

## Validation

- Console: 239 local tests and 56 browser tests passed; additional table-edit/send and MCP-dialog checks passed. Production build and Agent feature lint passed.
- Agent: 12 Skills Plugin tests, 6 Profile tests, 35 Loop tests and 92 Web tests passed. The Console proxy route test passed. Skills Plugin Clippy passed with warnings denied.
- Live Console proxy returned 99 available Skills; both Agent processes and Console were restarted with the local builds. Real dark/light and narrow-window screenshots were reviewed without submitting a model request or modifying existing conversations.
- Wider Clippy remains blocked by existing lint errors in the OpenAI auth and direct-model Plugins (`manual_let_else` and `too_many_lines`). Browser tests pass but Vitest reports a teardown timeout warning. Debug linking reports the existing macOS unwind-table size warning.
