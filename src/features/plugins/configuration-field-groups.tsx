import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import { ConfigurationFieldMatch } from "./configuration-field-search";
import {
  isSchemaObject,
  resolveConfigurationSchema,
} from "./plugin-configuration-schema";
import type { JsonObject } from "./plugin-control-contract";

interface FieldGroup {
  id: string;
  names: string[];
  schema: JsonObject;
}

// Titled, top-level allOf branches describe sections without nesting TOML.
// Use the fully resolved field schema, never a group's weaker constraints.
export function configurationFieldGroups(
  schema: JsonObject,
  resolved: JsonObject,
  value: unknown
): FieldGroup[] {
  const properties = isSchemaObject(resolved.properties)
    ? resolved.properties
    : {};
  const remaining = new Set(
    Object.keys(properties).filter((name) => isSchemaObject(properties[name]))
  );
  const groups: FieldGroup[] = [];
  if (Array.isArray(schema.allOf)) {
    for (const [index, branch] of schema.allOf.entries()) {
      if (
        !isSchemaObject(branch) ||
        typeof branch.title !== "string" ||
        !branch.title.trim()
      ) {
        continue;
      }
      const selected = resolveConfigurationSchema(branch, value);
      if (!selected || !isSchemaObject(selected.properties)) {
        continue;
      }
      // Overlapping groups show a field once, in the first declared group.
      const names = Object.keys(selected.properties).filter((name) =>
        remaining.delete(name)
      );
      if (names.length > 0) {
        groups.push({
          id: `allOf:${index}`,
          names,
          schema: {
            title: branch.title,
            ...(typeof branch.description === "string"
              ? { description: branch.description }
              : {}),
            properties: Object.fromEntries(
              names.map((name) => [name, properties[name]!])
            ),
          },
        });
      }
    }
  }
  if (remaining.size > 0) {
    const names = [...remaining];
    groups.unshift({
      id: "ungrouped",
      names,
      schema: {
        properties: Object.fromEntries(
          names.map((name) => [name, properties[name]!])
        ),
      },
    });
  }
  return groups;
}

const styles = stylex.create({
  groups: { display: "grid", gap: tokens.space6, minWidth: 0 },
  section: { display: "grid", gap: tokens.space3, minWidth: 0 },
  heading: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  description: {
    margin: 0,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 1.5,
    color: tokens.colorContentSecondary,
    maxWidth: "65ch",
    overflowWrap: "anywhere",
  },
  fields: { display: "grid", gap: tokens.space2, minWidth: 0 },
});

export function ConfigurationFieldGroups({
  groups,
  renderField,
}: {
  groups: FieldGroup[];
  renderField: (name: string) => ReactNode;
}) {
  return (
    <div {...stylex.props(styles.groups)}>
      {groups.map((group) => (
        <ConfigurationFieldMatch key={group.id} schema={group.schema} path={[]}>
          <section
            aria-label={
              typeof group.schema.title === "string"
                ? group.schema.title
                : undefined
            }
            {...stylex.props(styles.section)}
          >
            {typeof group.schema.title === "string" ? (
              <header>
                <h3 {...stylex.props(styles.heading)}>{group.schema.title}</h3>
                {typeof group.schema.description === "string" ? (
                  <p {...stylex.props(styles.description)}>
                    {group.schema.description}
                  </p>
                ) : null}
              </header>
            ) : null}
            <div {...stylex.props(styles.fields)}>
              {group.names.map(renderField)}
            </div>
          </section>
        </ConfigurationFieldMatch>
      ))}
    </div>
  );
}
