# Agent Profile editor

Status: implemented for the Agent's SQLite configuration authority.

Profiles has a dedicated Sidebar entry at `/settings/profiles`. The list selects the Agent and shows named Profiles, built-in/custom status, and the current revision. Create and duplicate open `/settings/profiles/:agentId/:profileName`; deep links retain the owning Agent. Sidebar owns page navigation. Within the editor, one bounded list is filtered by category and search: Tools, Tool providers/MCP, Skills/context, Instrument hooks, and other providers. Categories use capability metadata, with the built-in Skills provider identified by its stable Plugin ID because it exposes shared prompt/tool contracts. Providers without selection metadata remain in the other-provider group rather than being guessed from labels.

Templates and existing file Profiles are read-only previews rather than disabled forms. The editor presents Profile identity first, instructions second, and capability choices third. The editor header owns Save; Use Profile exists only on the list. Dirty drafts block route changes with Keep editing / Discard and leave, and protect browser unload. Provider configuration stays in the existing Plugin workbench, not in the Profile editor. Duplicate a Profile to create a named draft. Edit description, additive instructions, Tool choices and provider instances; unknown document fields and model defaults survive round trips. Search narrows bulk actions to matching items. Disabled providers remain installed and credentials stay in their owning stores. The editor does not claim per-Skill file editing or MCP installation.

Save draft performs revision-checked validation and SQLite persistence without changing the live Profile file. Use Profile on the list materializes the saved revision and prepares a Ready-Gated Generation. Running turns retain their existing configuration and session history. A failed preparation retains the prior active Generation and saved draft. Active and saved revisions are separate; another save does not silently activate the change. Conflicts preserve editor input; Reset reloads the latest saved version.

Profile Tool choices intersect Agent-wide permissions and the resolved catalog. Inherit permissions removes the Profile-specific ceiling; an empty list disables all Tools. Agent-wide permissions remain visible in Agent settings. The displayed Tool catalog comes from the current runtime; provider changes may reveal different Tools after applying.

The Agent exposes authorized GET/POST `control/profiles` and POST `control/profile` with an optional `expectedRevision`. Console proxies these only with Plugin configuration capability. Hosts using file authority report that editing requires SQLite management.

Validation covers draft isolation, revision conflicts, invalid dependencies, online activation, restart recovery, filtered bulk editing, unknown-field preservation, and retaining input after a failed save. Existing Profile import and session-prompt refresh tests remain in the focused regression suite.

## Settings ownership

Preferences owns appearance and locale. Connections owns account access, model-service configuration, and MCP configuration links to the Plugin workbench. Profiles owns instructions and capability selection. The old Guidance page redirects to Profiles; the old AI & Agents overview redirects to Connections. Runtime prompt/resource catalogs are not presented as editable behavior settings.

Global tool restrictions are available through Connections > Advanced. Profiles show restricted tools as blocked and disabled; bulk enabling skips those tools. Existing saved selections are preserved until explicitly edited, while effective availability respects the global ceiling. Instruction sources have their own capability category, with a link to their owning Plugin and a required-source label when the source cannot be disabled.
