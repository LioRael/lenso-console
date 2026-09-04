import { Select } from "@lenso/ui/select";
import * as stylex from "@stylexjs/stylex";
import { useId, useMemo, useState, type ReactNode } from "react";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import {
  isSchemaObject,
  mergeSchema,
  resolveConfigurationSchema,
} from "./plugin-configuration-schema";
import type { JsonObject } from "./plugin-control-contract";

const styles = stylex.create({
  root: { display: "grid", gap: tokens.space4, minWidth: 0 },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space3,
  },
  select: { marginInlineStart: "auto", minWidth: 160, maxWidth: "100%" },
  note: { color: tokens.colorContentSecondary, fontSize: 12, margin: 0 },
});

export function configurationVariants(schema: JsonObject, value: unknown) {
  // Nullable unions already have a single concrete editor.
  if (resolveConfigurationSchema(schema, value)) {
    return null;
  }
  const keyword = schema.oneOf ? "oneOf" : "anyOf";
  const branches = schema[keyword];
  if (
    (schema.oneOf && schema.anyOf) ||
    !Array.isArray(branches) ||
    branches.length < 2 ||
    branches.length > 32 ||
    !branches.every(isSchemaObject)
  ) {
    return null;
  }
  // A different form must not expose a secret or bypass a read-only contract.
  if (hasProtectedSchema(schema)) {
    return null;
  }
  const base = Object.fromEntries(
    Object.entries(schema).filter(([key]) => key !== keyword)
  );
  return branches.map((branch, index) => {
    const combined = mergeSchema(base, branch);
    return {
      label:
        typeof branch.title === "string"
          ? branch.title
          : `Variant ${index + 1}`,
      schema: combined,
    };
  });
}

function hasProtectedSchema(schema: JsonObject, depth = 0): boolean {
  if (
    depth > 24 ||
    schema.readOnly === true ||
    schema.writeOnly === true ||
    schema.format === "password" ||
    "$ref" in schema ||
    "$dynamicRef" in schema
  ) {
    return true;
  }
  const children = [
    schema.properties,
    schema.additionalProperties,
    schema.items,
    schema.allOf,
    schema.oneOf,
    schema.anyOf,
    schema.if,
    schema.then,
    schema.else,
  ];
  return children.some((child) => {
    if (Array.isArray(child)) {
      return child.some(
        (entry) => isSchemaObject(entry) && hasProtectedSchema(entry, depth + 1)
      );
    }
    if (!isSchemaObject(child)) {
      return false;
    }
    if (child === schema.properties) {
      return Object.values(child).some(
        (entry) => isSchemaObject(entry) && hasProtectedSchema(entry, depth + 1)
      );
    }
    return hasProtectedSchema(child, depth + 1);
  });
}

// Only required, explicit constants are written by choosing a form. No defaults
// are materialized and no fields belonging to another branch are removed.
export function applyVariantConstants(
  value: unknown,
  schema: JsonObject
): unknown {
  if (
    schema.const !== undefined &&
    schema.const !== null &&
    typeof schema.const !== "object"
  ) {
    return schema.const;
  }
  if (!isSchemaObject(schema.properties) || !Array.isArray(schema.required)) {
    return value;
  }
  let result = value;
  for (const name of schema.required) {
    if (typeof name !== "string") {
      continue;
    }
    const property = schema.properties[name];
    if (!isSchemaObject(property)) {
      continue;
    }
    const previous = isSchemaObject(result) ? result[name] : undefined;
    const next = applyVariantConstants(previous, property);
    if (next !== previous) {
      result = Object.fromEntries([
        ...Object.entries(isSchemaObject(result) ? result : {}),
        [name, next],
      ]);
    }
  }
  return result;
}

export function ConfigurationVariants({
  schema,
  value,
  disabled,
  onSelect,
  children,
}: {
  schema: JsonObject;
  value: unknown;
  disabled: boolean;
  onSelect: (schema: JsonObject) => void;
  children: (schema: JsonObject) => ReactNode;
}) {
  const id = useId();
  const [choice, setChoice] = useState<{
    schema: JsonObject;
    index: number;
  } | null>(null);
  const variants = useMemo(
    () => configurationVariants(schema, undefined),
    [schema]
  );
  if (!variants) {
    return children(schema);
  }
  const selected =
    choice?.schema === schema ? variants[choice.index] : undefined;
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.row)}>
        <label htmlFor={id}>Configuration variant</label>
        <Select.Root
          disabled={disabled}
          value={selected ? String(choice!.index) : ""}
          onValueChange={(next) => {
            if (typeof next !== "string" || next === "") {
              return;
            }
            const index = Number(next);
            const variant = variants[index];
            if (!variant?.schema) {
              return;
            }
            const resolved = resolveConfigurationSchema(variant.schema, value);
            if (!resolved) {
              return;
            }
            setChoice({ schema, index });
            onSelect(resolved);
          }}
        >
          <Select.Trigger
            id={id}
            aria-label="Configuration variant"
            xstyle={styles.select}
          >
            <Select.Value>{selected?.label ?? "Choose a variant"}</Select.Value>
            <Select.Icon />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner align="end">
              <Select.Popup>
                <Select.List>
                  {variants.map((variant, index) => (
                    <Select.Item
                      key={String(index)}
                      value={String(index)}
                      disabled={
                        !variant.schema ||
                        !resolveConfigurationSchema(variant.schema, value)
                      }
                    >
                      <Select.ItemText>{variant.label}</Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
      <p {...stylex.props(styles.note)}>
        Existing fields are kept. Choosing a variant updates its required fixed
        values; other values change only when edited.
      </p>
      {selected?.schema ? children(selected.schema) : null}
    </div>
  );
}
