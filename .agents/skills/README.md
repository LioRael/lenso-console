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
