# Agent Profile editor

Status: implemented for the Agent's SQLite configuration authority.

Agent selection stays above a named Profile editor. Sidebar owns page navigation. Within the editor, one bounded list is filtered by category and search: Tools, Tool providers/MCP, Skills/context, Instrument hooks, and other providers. Categories use capability metadata, with the built-in Skills provider identified by its stable Plugin ID because it exposes shared prompt/tool contracts. Providers without selection metadata remain in the other-provider group rather than being guessed from labels.

Templates and existing file Profiles are read-only previews rather than disabled forms. The editor presents Profile identity first, instructions second, and capability choices third. Save/apply actions share one footer; provider configuration remains in a collapsed secondary section. Duplicate a Profile to create a named draft. Edit description, additive instructions, Tool choices and provider instances; unknown document fields and model defaults survive round trips. Search narrows bulk actions to matching items. Disabled providers remain installed and credentials stay in their owning stores. The editor does not claim per-Skill file editing or MCP installation.

Save draft performs revision-checked validation and SQLite persistence without changing the live Profile file. Apply Profile materializes the saved revision and prepares a Ready-Gated Generation. Running turns retain their existing configuration and session history. A failed preparation retains the prior active Generation and saved draft. Active and saved revisions are separate; another save does not silently activate the change. Conflicts preserve editor input; Reset reloads the latest saved version.

Profile Tool choices intersect Agent-wide permissions and the resolved catalog. Inherit permissions removes the Profile-specific ceiling; an empty list disables all Tools. Agent-wide permissions are available separately in a collapsed advanced section. The displayed Tool catalog comes from the current runtime; provider changes may reveal different Tools after applying.

The Agent exposes authorized GET/POST `control/profiles` and POST `control/profile` with an optional `expectedRevision`. Console proxies these only with Plugin configuration capability. Hosts using file authority report that editing requires SQLite management.

Validation covers draft isolation, revision conflicts, invalid dependencies, online activation, restart recovery, filtered bulk editing, unknown-field preservation, and retaining input after a failed save. Existing Profile import and session-prompt refresh tests remain in the focused regression suite.
