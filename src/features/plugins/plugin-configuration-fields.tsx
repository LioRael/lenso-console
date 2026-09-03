import { Switch } from "@lenso/ui/switch";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useState } from "react";
import { parse, stringify } from "smol-toml";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import type { JsonObject, JsonValue } from "./plugin-control-contract";

type SchemaProperty = JsonObject & {
  description?: string;
  enum?: readonly JsonValue[];
  format?: string;
  items?: JsonObject;
  maximum?: number;
  minimum?: number;
  title?: string;
  type?: string;
};

const styles = stylex.create({
  description: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
  },
  empty: {
    color: tokens.colorContentTertiary,
    fontSize: 12,
    margin: 0,
    paddingBlock: tokens.space6,
  },
  field: {
    alignItems: "start",
    borderTopColor: tokens.colorBorderTertiary,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gap: tokens.space6,
    gridTemplateColumns: "minmax(150px, 220px) minmax(0, 1fr)",
    paddingBlock: tokens.space4,
    ":first-child": { borderTopWidth: 0 },
    "@media (max-width: 640px)": {
      gap: tokens.space2,
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  fieldCopy: { display: "grid", gap: 2 },
  fieldName: {
    color: tokens.colorContentPrimary,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "18px",
  },
  fieldOptional: {
    color: tokens.colorContentTertiary,
    fontSize: 10,
    fontWeight: 400,
    marginInlineStart: tokens.space2,
  },
  fields: { display: "grid" },
  input: {
    backgroundColor: tokens.colorSurfaceCanvas,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    color: tokens.colorContentPrimary,
    fontFamily: "inherit",
    fontSize: 12,
    lineHeight: "18px",
    minHeight: 32,
    outline: {
      default: "none",
      ":focus": `2px solid ${tokens.colorFocusRing}`,
    },
    outlineOffset: -1,
    paddingBlock: 6,
    paddingInline: tokens.space3,
    width: "100%",
  },
  textarea: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    minHeight: 70,
    resize: "vertical",
  },
  switchControl: {
    alignItems: "center",
    display: "flex",
    minHeight: 32,
  },
});

export function PluginConfigurationFields({
  defaults,
  disabled,
  onChange,
  schema,
  toml,
}: {
  defaults: JsonObject;
  disabled: boolean;
  onChange: (toml: string) => void;
  schema: JsonObject;
  toml: string;
}) {
  const properties = schemaProperties(schema);
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (value): value is string => typeof value === "string"
        )
      : []
  );
  const parsed = useMemo(() => parseConfiguration(toml), [toml]);
  const values = parsed ? { ...defaults, ...parsed } : null;

  if (properties.length === 0) {
    return (
      <p {...stylex.props(styles.empty)}>
        This Plugin does not declare editable fields.
      </p>
    );
  }
  if (!values) {
    return (
      <p role="alert" {...stylex.props(styles.empty)}>
        The current configuration is not valid TOML. Fix it in Advanced before
        using fields.
      </p>
    );
  }

  const update = (name: string, value: unknown) => {
    const next = { ...(parsed ?? {}) };
    if (value === undefined) {
      delete next[name];
    } else {
      next[name] = value;
    }
    onChange(stringify(next));
  };

  return (
    <div {...stylex.props(styles.fields)}>
      {properties.map(([name, property]) => (
        <div key={name} {...stylex.props(styles.field)}>
          <div {...stylex.props(styles.fieldCopy)}>
            <label
              htmlFor={`plugin-config-${name}`}
              {...stylex.props(styles.fieldName)}
            >
              {property.title ?? humanize(name)}
              {required.has(name) ? null : (
                <span {...stylex.props(styles.fieldOptional)}>Optional</span>
              )}
            </label>
            {property.description ? (
              <p {...stylex.props(styles.description)}>
                {property.description}
              </p>
            ) : null}
          </div>
          <ConfigurationControl
            disabled={disabled}
            id={`plugin-config-${name}`}
            name={name}
            onChange={(value) => update(name, value)}
            property={property}
            required={required.has(name)}
            value={values[name]}
          />
        </div>
      ))}
    </div>
  );
}

function ConfigurationControl({
  disabled,
  id,
  name,
  onChange,
  property,
  required,
  value,
}: {
  disabled: boolean;
  id: string;
  name: string;
  onChange: (value: unknown) => void;
  property: SchemaProperty;
  required: boolean;
  value: unknown;
}) {
  if (property.type === "boolean") {
    return (
      <div {...stylex.props(styles.switchControl)}>
        <Switch.Root
          aria-label={property.title ?? humanize(name)}
          checked={value === true}
          disabled={disabled}
          id={id}
          onCheckedChange={onChange}
        />
      </div>
    );
  }
  if (property.enum?.every((option) => typeof option === "string")) {
    return (
      <select
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value || undefined)}
        required={required}
        value={typeof value === "string" ? value : ""}
        {...stylex.props(styles.input)}
      >
        {!required ? <option value="">Not set</option> : null}
        {property.enum.map((option) => (
          <option key={String(option)} value={String(option)}>
            {humanize(String(option))}
          </option>
        ))}
      </select>
    );
  }
  if (property.type === "integer" || property.type === "number") {
    return (
      <input
        disabled={disabled}
        id={id}
        max={property.maximum}
        min={property.minimum}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : Number(event.target.value)
          )
        }
        required={required}
        step={property.type === "integer" ? 1 : "any"}
        type="number"
        value={typeof value === "number" ? value : ""}
        {...stylex.props(styles.input)}
      />
    );
  }
  if (property.type === "array") {
    const items = Array.isArray(value) ? value : [];
    return (
      <textarea
        disabled={disabled}
        id={id}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
          )
        }
        placeholder="One value per line"
        rows={3}
        value={items.map(String).join("\n")}
        {...stylex.props(styles.input, styles.textarea)}
      />
    );
  }
  if (property.type === "object") {
    return (
      <ObjectMapControl
        disabled={disabled}
        id={id}
        onChange={onChange}
        value={isPlainObject(value) ? value : {}}
      />
    );
  }
  return (
    <input
      disabled={disabled}
      id={id}
      onChange={(event) =>
        onChange(
          event.target.value === "" && !required
            ? undefined
            : event.target.value
        )
      }
      placeholder={property.format === "uri" ? "https://…" : undefined}
      required={required}
      type={property.format === "password" ? "password" : "text"}
      value={typeof value === "string" ? value : ""}
      {...stylex.props(styles.input)}
    />
  );
}

function ObjectMapControl({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange: (value: unknown) => void;
  value: Record<string, unknown>;
}) {
  const externalValue = objectMapText(value);
  const [draft, setDraft] = useState(externalValue);
  useEffect(() => setDraft(externalValue), [externalValue]);
  return (
    <textarea
      disabled={disabled}
      id={id}
      onBlur={() => {
        if (draft !== externalValue) {
          onChange(parseObjectMap(draft));
        }
      }}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="key = value"
      rows={4}
      value={draft}
      {...stylex.props(styles.input, styles.textarea)}
    />
  );
}

function schemaProperties(schema: JsonObject): [string, SchemaProperty][] {
  if (!isPlainObject(schema.properties)) {
    return [];
  }
  return Object.entries(schema.properties).filter(
    (entry): entry is [string, SchemaProperty] => isPlainObject(entry[1])
  );
}

function parseConfiguration(toml: string): Record<string, unknown> | null {
  try {
    return parse(toml);
  } catch {
    return null;
  }
}

function humanize(value: string) {
  const words = value.replaceAll(/[_.-]+/gu, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectMapText(value: Record<string, unknown>) {
  return Object.entries(value)
    .map(([key, item]) => `${key} = ${String(item)}`)
    .join("\n");
}

function parseObjectMap(value: string) {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.split("=", 2).map((part) => part.trim()))
      .filter(([key, item]) => Boolean(key && item))
  );
}
