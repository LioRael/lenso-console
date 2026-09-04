# Configuration field groups

Plugin configuration editors can present titled top-level `allOf` branches as
sections. Group titles and descriptions are ordinary JSON Schema annotations;
the properties listed in a branch determine its fields and their display order.

```json
{
  "type": "object",
  "properties": {
    "endpoint": { "type": "string" },
    "timeout_ms": { "type": "integer", "minimum": 1 }
  },
  "allOf": [
    { "title": "Connection", "properties": { "endpoint": true } },
    { "title": "Behavior", "properties": { "timeout_ms": true } }
  ]
}
```

Boolean `true` references an already declared field without adding constraints.
It is not a default value. Configuration keys stay flat, and the Host still
validates the complete Schema. A Host must support `allOf` and boolean schemas
(Lenso App Plan 0.3.2 or later).

Console renders each field using its fully resolved constraints, not the group
branch alone. Only active editable fields appear; empty groups disappear.
Overlapping groups show the field once, in the first group. Ungrouped fields
remain above the named sections. Schemas without titled branches retain the
flat editor. Groups do not change values or add TOML tables.

Searching a group title or description shows that group's fields. Searching a
field shows its matching section; filtering keeps controls mounted.
