# Agent project workbench

The conversation page displays the selected Agent's current working directory
when its bootstrap response includes `workspace.path`. New and resumed tasks
remain on Agent-qualified routes. The existing Agent picker selects a connected
Agent; it does not change a running process's directory or bind older Sessions to
that directory. Agents without workspace metadata retain the existing interface.

The Changes tab displays successful `git_diff` and `checkpoint_review` results
recorded in the current task. It identifies truncated output, retains earlier
snapshots, and renders output as text. These snapshots may be stale. “Ask for a
fresh diff” prepares a message for the user to submit through the existing Tool
policy; it does not query or modify the filesystem directly.

The optional bootstrap contract is defined in Agent ADR-0102. Deploy an Agent
build containing that change to enable directory context; Agent v0.1.6 does not
include the field. Changes remains available for existing recorded Tool results.
