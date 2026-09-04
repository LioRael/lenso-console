import { Button } from "@lenso/ui/button";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { createContext, useContext, useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import { isSchemaObject } from "./plugin-configuration-schema";
import type { JsonObject } from "./plugin-control-contract";

const SearchQuery = createContext("");
const styles = stylex.create({
  search: { display: "flex", alignItems: "center", gap: tokens.space2 },
  input: { flex: 1, minWidth: 0 },
  empty: { margin: 0, color: tokens.colorContentSecondary, fontSize: 12 },
});

function matchesLabel(
  schema: JsonObject,
  path: readonly (number | string)[],
  query: string
) {
  return [
    path.join("."),
    path.join(" ").replaceAll(/[_-]/gu, " "),
    schema.title,
    schema.description,
  ].some(
    (text) => typeof text === "string" && text.toLowerCase().includes(query)
  );
}

// Search schema metadata only, never defaults, enum choices or stored values.
function matchesSchema(
  schema: JsonObject,
  path: readonly (number | string)[],
  query: string,
  depth = 0
): boolean {
  if (depth > 24) {
    return false;
  }
  if (matchesLabel(schema, path, query)) {
    return true;
  }
  if (
    isSchemaObject(schema.properties) &&
    Object.entries(schema.properties).some(
      ([name, child]) =>
        isSchemaObject(child) &&
        matchesSchema(child, [...path, name], query, depth + 1)
    )
  ) {
    return true;
  }
  for (const key of [
    "items",
    "additionalProperties",
    "allOf",
    "oneOf",
    "anyOf",
    "if",
    "then",
    "else",
  ]) {
    const child = schema[key];
    const children = Array.isArray(child) ? child : [child];
    if (
      children.some(
        (entry) =>
          isSchemaObject(entry) &&
          matchesSchema(
            entry,
            key === "additionalProperties"
              ? [...path, "Additional entries"]
              : path,
            query,
            depth + 1
          )
      )
    ) {
      return true;
    }
  }
  return false;
}

export function ConfigurationFieldSearch({
  schema,
  children,
}: {
  schema: JsonObject;
  children: ReactNode;
}) {
  const [text, setText] = useState("");
  const query = text.trim().toLowerCase();
  const hasMatches =
    Object.entries(
      isSchemaObject(schema.properties) ? schema.properties : {}
    ).some(
      ([name, property]) =>
        isSchemaObject(property) && matchesSchema(property, [name], query)
    ) ||
    (isSchemaObject(schema.additionalProperties) &&
      matchesSchema(
        schema.additionalProperties,
        ["Additional entries"],
        query
      ));
  return (
    <SearchQuery value={query}>
      <div {...stylex.props(styles.search)}>
        <TextField.Root xstyle={styles.input}>
          <TextField.Control
            type="search"
            aria-label="Search configuration fields"
            placeholder="Search fields by name or description…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </TextField.Root>
        {text ? (
          <Button size="compact" variant="ghost" onClick={() => setText("")}>
            Clear search
          </Button>
        ) : null}
      </div>
      {query && !hasMatches ? (
        <output {...stylex.props(styles.empty)}>
          No matching fields. Try a field name, path or description.
        </output>
      ) : null}
      {children}
    </SearchQuery>
  );
}

export function ConfigurationFieldMatch({
  schema,
  path,
  children,
}: {
  schema: JsonObject;
  path: readonly (number | string)[];
  children: ReactNode;
}) {
  const query = useContext(SearchQuery);
  const visible = !query || matchesSchema(schema, path, query);
  // Keep controls mounted: filtering must not discard local input or variant selection.
  return (
    <div hidden={!visible}>
      <SearchQuery value={matchesLabel(schema, path, query) ? "" : query}>
        {children}
      </SearchQuery>
    </div>
  );
}
