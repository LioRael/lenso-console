# Lenso Console

Console is the extensible administration and development workbench for Lenso
Apps. Application administration and team tools share a work environment without
sharing ownership of their business facts.

## Language

**Console**:
The workbench in which people administer Apps and use development and team tools.
It is not synonymous with the Console Agent or with one App's business backend.

**Managed App**:
An App selected as the subject of administration or observation, whether or not
it provides an Agent.
_Avoid_: Agent as a synonym for an administration target.

**App administration page**:
A business management interface for a specific Managed App, such as user
management or content moderation.

**Console tool workspace**:
A cohesive tool experience within Console, such as observability or project
management, whose identity is not implicitly the identity of a Managed App.
_Avoid_: Workspace as an unqualified synonym for a filesystem directory.

**Page contribution**:
A Plugin-owned interface offered within Console, ranging from a page to a
multi-page workspace.

**Contribution owner**:
The Plugin instance responsible for a Page contribution, which need not belong
to the App that the page is about.

**Page subject**:
The Managed App or Console workspace that a Page contribution presents.
_Avoid_: Treating the currently selected Agent as the implicit page subject.

**Page mount**:
A specific Page contribution presented for one owner and subject, retaining that
identity across navigation and version changes.

**Console extension**:
A Plugin installed to extend Console itself, rather than implicitly extending a
Managed App or the Management Agent.

**Observability workbench**:
The tool workspace in which a developer investigates App behavior using
telemetry and authoritative runtime context.
_Avoid_: Story as the name of a restored universal event model.

**Plugin marketplace**:
The discovery and evaluation entry point for installable Plugins, distinct from
their source repositories and artifact distribution.

**Agent Project**:
The directory-bound Agent execution scope called Project in the existing Agent
workflow.
_Avoid_: Treating it as a project-management business object.

**Project-management project**:
A business object grouping planned work within a project-management Plugin,
distinct from an Agent Project.
