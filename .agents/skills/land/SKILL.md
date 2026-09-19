# Land Console changes

This is the optional agent entry point for the common contribution and delivery
contract in [`CONTRIBUTING.md`](../../../CONTRIBUTING.md). Read that guide first.

In Delta, **Land Changes** opens a dedicated delivery review and `/land` invokes
this skill in the current task when supported. `/land` is not a universal shell
command or permission grant. Other agents use their supported invocation; plain
Git maintainers use the documented commands. Use the Delta-managed checkout
directly—never create a nested Worktrunk worktree.

Landing requires explicit authorization, meaningful review, a final immutable
candidate push, successful `ci` `quality` evidence for that exact candidate ref,
and a normal same-SHA fast-forward to `main`. Keep publication, versioning,
tags, releases, and deployment separate; this skill never authorizes them.
