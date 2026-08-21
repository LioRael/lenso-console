---
status: superseded by ADR-0006
---

# Present Runtime execution evidence as semantic groups

The Story Inspector presents execution evidence as ordered, purpose-named
groups selected by the execution node type. Event evidence uses Event,
Envelope, and Delivery groups; function evidence uses Input, Result, and
Execution; provider calls use Request, Response, and Call. HTTP, workflow,
compensation, intervention, timer, and federated nodes have corresponding
semantic groups. Unknown node types fall back to Evidence, Outcome, and
Context.

The Console Service owns this presentation contract because it knows the
meaning of each source record. Clients render the ordered groups and may map
their stable keys to localized labels, but do not reconstruct source semantics
from generic `input`, `output`, and `metadata` fields. Those legacy fields remain
temporarily additive for older clients.

An unavailable field is represented by an Execution Evidence Gap with either
`not_applicable` or `not_captured` status. For example, a GET provider call has a
request-body gap marked `not_applicable`, while a response body omitted by the
provider evidence store is `not_captured`. Empty JSON must not imply either
state.

## Considered Options

- Keeping one Input, Output, and Metadata layout was rejected because those
  labels hide the operational meaning of source records and make absent body
  evidence ambiguous.
- Deriving all groups in the browser was rejected because different clients
  would duplicate and eventually disagree about source semantics.
- Persisting raw request and response bodies from the Console was rejected
  because Console is not the source owner and read-time redaction would leave
  sensitive data at rest.

## Consequences

Each evidence source must map through one server-owned grouping seam, and each
group is recursively redacted before it leaves the Console Service. Group-level
redaction paths describe the content operators actually see.

Future body capture belongs to the runtime or provider that observes the body.
It must be bounded, policy-controlled, and redacted before persistence; Console
read-time redaction remains defense in depth. Once such evidence is available,
it can fill the existing Request or Response group without changing the
Inspector's conceptual model.
