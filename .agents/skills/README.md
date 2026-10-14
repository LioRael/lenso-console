# Console development skills

Start with [Console plugin development](console-plugin-development/SKILL.md).
It selects one of three focused workflows:

| Skill | Use it for |
| --- | --- |
| [Page authoring](console-page-authoring/SKILL.md) | Directory compilation, services, workspace metadata, and explicit mounting |
| [Page interactions](console-page-interactions/SKILL.md) | Local bindings, page state, corners, selection, Command, and task context |
| [Dashboard widgets](console-dashboard-widgets/SKILL.md) | Optional widget composition, instances, drafts, and persistence |

These are repository-local agent instructions. Read their `SKILL.md` directly
when the agent's tool does not register project skills. They are not installed
globally, and this change does not add them to published npm archives.

Delta/Codex consumers should start from this checkout's `AGENTS.md` link, or
explicitly load the focused `SKILL.md` path when project-skill discovery is not
available. A dependency installation alone does not activate these instructions.
Keep the Lenso UI component-contract skill available separately; Console's
presentation guidance is not its replacement.

For another application repository, hand off a pinned source revision and its
skill entry path. Do not copy only `SKILL.md`: references also resolve to this
checkout's design docs and package examples. Use the pinned checkout or a
complete reviewed support bundle preserving those links. Project-local delivery
and an explicit personal/global install are different operations; neither npm
publication nor a global skill install is performed by this documentation work.

## Maintaining the skills

Keep decision rules in the workflow and detailed recipes behind references.
Link to package source or a real example for API details instead of reproducing
the full API reference. A recipe is supported only when the public export and
the consuming host both implement it.

When an API or host changes:

1. Update the skill that owns the affected boundary.
2. Check linked paths and public imports.
3. Typecheck changed code examples against the current public package.
4. Check a positive and a negative scenario: the skill should select the right
   capability and decline a superficially similar unsupported use.

`land` remains a separate, explicitly authorized delivery workflow.
