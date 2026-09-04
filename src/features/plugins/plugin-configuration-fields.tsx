import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Select } from "@lenso/ui/select";
import { Switch } from "@lenso/ui/switch";
import { TextArea } from "@lenso/ui/text-area";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parse, stringify } from "smol-toml";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import type { JsonObject, JsonValue } from "./plugin-control-contract";

type SchemaProperty = JsonObject & {
  additionalProperties?: boolean | JsonObject;
  const?: JsonValue;
  default?: JsonValue;
  deprecated?: boolean;
  description?: string;
  enum?: readonly JsonValue[];
  format?: string;
  items?: SchemaProperty;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  minLength?: number;
  minItems?: number;
  pattern?: string;
  properties?: JsonObject;
  required?: readonly JsonValue[];
  title?: string;
  type?: string;
};

const unsetSelectValue = "__lenso_configuration_unset__";

const styles = stylex.create({
  collection: {
    display: "grid",
    gap: tokens.space3,
    minWidth: 0,
  },
  collectionAction: { justifySelf: "start" },
  collectionEmpty: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
    paddingBlock: tokens.space2,
  },
  collectionItem: {
    backgroundColor: tokens.colorSurfaceSubtle,
    borderColor: tokens.colorBorderTertiary,
    borderRadius: tokens.radiusControl,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    minWidth: 0,
    padding: tokens.space3,
  },
  collectionItemHeader: {
    alignItems: "center",
    display: "flex",
    gap: tokens.space2,
    justifyContent: "space-between",
    minHeight: 28,
    paddingBlockEnd: tokens.space2,
  },
  collectionItemTitle: {
    color: tokens.colorContentSecondary,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: "16px",
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  controlRoot: { width: "100%" },
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
    display: "grid",
    gap: tokens.space6,
    gridTemplateColumns: "minmax(150px, 220px) minmax(0, 1fr)",
    paddingBlock: tokens.space3,
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
  fields: { display: "grid", gap: tokens.space2 },
  nestedField: {
    alignItems: "start",
    display: "grid",
    gap: tokens.space3,
    gridTemplateColumns: "minmax(110px, 160px) minmax(0, 1fr)",
    paddingBlock: tokens.space2,
    "@media (max-width: 640px)": {
      gap: tokens.space2,
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  nestedFields: { display: "grid", gap: tokens.space2, minWidth: 0 },
  readOnlyValue: {
    alignItems: "center",
    color: tokens.colorContentSecondary,
    display: "flex",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: "18px",
    minHeight: 32,
    overflowWrap: "anywhere",
    paddingInline: tokens.space3,
  },
  selectTrigger: {
    justifyContent: "space-between",
    minWidth: 0,
    width: "100%",
  },
  switchControl: {
    alignItems: "center",
    display: "flex",
    minHeight: 32,
  },
  textArea: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    minHeight: 78,
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
  const required = schemaRequired(schema);
  const parsed = useMemo(() => parseConfiguration(toml), [toml]);

  if (properties.length === 0) {
    return (
      <p {...stylex.props(styles.empty)}>
        This Plugin does not declare editable fields.
      </p>
    );
  }
  if (!parsed) {
    return (
      <p role="alert" {...stylex.props(styles.empty)}>
        The current configuration is not valid TOML. Fix it in Advanced before
        using fields.
      </p>
    );
  }
  const values = deepMerge(defaults, parsed);

  const update = (name: string, value: unknown) => {
    onChange(stringify(updateObjectValue(parsed, name, value)));
  };

  return (
    <div {...stylex.props(styles.fields)}>
      {properties.map(([name, property]) => (
        <ConfigurationField
          disabled={disabled}
          key={name}
          name={name}
          onChange={(value) => update(name, value)}
          path={[name]}
          property={property}
          required={required.has(name)}
          value={values[name]}
        />
      ))}
    </div>
  );
}

function ConfigurationField({
  disabled,
  name,
  onChange,
  path,
  property,
  required,
  value,
}: {
  disabled: boolean;
  name: string;
  onChange: (value: unknown) => void;
  path: readonly (number | string)[];
  property: SchemaProperty;
  required: boolean;
  value: unknown;
}) {
  const id = fieldId(path);
  return (
    <div {...stylex.props(styles.field)}>
      <FieldCopy id={id} name={name} property={property} required={required} />
      <ConfigurationControl
        disabled={disabled}
        id={id}
        name={name}
        onChange={onChange}
        path={path}
        property={property}
        required={required}
        value={value}
      />
    </div>
  );
}

function FieldCopy({
  id,
  name,
  property,
  required,
}: {
  id: string;
  name: string;
  property: SchemaProperty;
  required: boolean;
}) {
  return (
    <div {...stylex.props(styles.fieldCopy)}>
      <label htmlFor={id} {...stylex.props(styles.fieldName)}>
        {property.title ?? humanize(name)}
        {property.deprecated ? (
          <span {...stylex.props(styles.fieldOptional)}>Deprecated</span>
        ) : required ? null : (
          <span {...stylex.props(styles.fieldOptional)}>Optional</span>
        )}
      </label>
      {property.description ? (
        <p {...stylex.props(styles.description)}>{property.description}</p>
      ) : null}
    </div>
  );
}

function ConfigurationControl({
  disabled,
  id,
  name,
  onChange,
  path,
  property,
  required,
  value,
}: {
  disabled: boolean;
  id: string;
  name: string;
  onChange: (value: unknown) => void;
  path: readonly (number | string)[];
  property: SchemaProperty;
  required: boolean;
  value: unknown;
}) {
  if (property.const !== undefined) {
    return (
      <code id={id} {...stylex.props(styles.readOnlyValue)}>
        {displayValue(property.const)}
      </code>
    );
  }
  if (property.type === "boolean") {
    return (
      <div {...stylex.props(styles.switchControl)}>
        <Switch.Root
          aria-label={property.title ?? humanize(name)}
          checked={value === true}
          disabled={disabled}
          id={id}
          onCheckedChange={onChange}
          layout="control-only"
        >
          <Switch.Thumb />
        </Switch.Root>
      </div>
    );
  }
  if (property.enum?.every((option) => typeof option === "string")) {
    const options = property.enum as readonly string[];
    const selectedValue = typeof value === "string" ? value : unsetSelectValue;
    return (
      <Select.Root
        disabled={disabled}
        onValueChange={(nextValue) => {
          if (typeof nextValue === "string") {
            onChange(nextValue === unsetSelectValue ? undefined : nextValue);
          }
        }}
        value={selectedValue}
      >
        <Select.Trigger id={id} xstyle={styles.selectTrigger}>
          <Select.Value>
            {selectedValue === unsetSelectValue
              ? "Not set"
              : humanize(selectedValue)}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner align="end" position="item-aligned">
            <Select.Popup>
              <Select.List>
                {required ? null : (
                  <Select.Item value={unsetSelectValue}>
                    <Select.ItemText>Not set</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                )}
                {options.map((option) => (
                  <Select.Item key={option} value={option}>
                    <Select.ItemText>{humanize(option)}</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    );
  }
  if (property.type === "integer" || property.type === "number") {
    return (
      <TextField.Root size="compact" xstyle={styles.controlRoot}>
        <TextField.Control
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
        />
      </TextField.Root>
    );
  }
  if (property.type === "array") {
    const items = Array.isArray(value) ? value : [];
    if (
      property.items?.type === "object" ||
      schemaProperties(property.items ?? {}).length > 0
    ) {
      return (
        <ObjectArrayControl
          disabled={disabled}
          itemSchema={property.items ?? { type: "object" }}
          maxItems={property.maxItems}
          minItems={property.minItems}
          name={name}
          onChange={onChange}
          path={path}
          value={items}
        />
      );
    }
    return (
      <ScalarArrayControl
        disabled={disabled}
        id={id}
        itemSchema={property.items}
        onChange={onChange}
        value={items}
      />
    );
  }
  if (property.type === "object" || schemaProperties(property).length > 0) {
    if (schemaProperties(property).length > 0) {
      return (
        <ObjectFieldsControl
          disabled={disabled}
          onChange={onChange}
          path={path}
          schema={property}
          value={isPlainObject(value) ? value : {}}
        />
      );
    }
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
    <TextField.Root size="compact" xstyle={styles.controlRoot}>
      <TextField.Control
        disabled={disabled}
        id={id}
        maxLength={property.maxLength}
        minLength={property.minLength}
        onChange={(event) =>
          onChange(
            event.target.value === "" && !required
              ? undefined
              : event.target.value
          )
        }
        placeholder={property.format === "uri" ? "https://…" : undefined}
        pattern={property.pattern}
        required={required}
        type={property.format === "password" ? "password" : "text"}
        value={typeof value === "string" ? value : ""}
      />
    </TextField.Root>
  );
}

function ObjectFieldsControl({
  disabled,
  onChange,
  path,
  schema,
  value,
}: {
  disabled: boolean;
  onChange: (value: unknown) => void;
  path: readonly (number | string)[];
  schema: SchemaProperty;
  value: Record<string, unknown>;
}) {
  const required = schemaRequired(schema);
  return (
    <div {...stylex.props(styles.nestedFields)}>
      {schemaProperties(schema).map(([name, property]) => {
        const nestedPath = [...path, name];
        const id = fieldId(nestedPath);
        return (
          <div key={name} {...stylex.props(styles.nestedField)}>
            <FieldCopy
              id={id}
              name={name}
              property={property}
              required={required.has(name)}
            />
            <ConfigurationControl
              disabled={disabled}
              id={id}
              name={name}
              onChange={(nextValue) =>
                onChange(updateObjectValue(value, name, nextValue))
              }
              path={nestedPath}
              property={property}
              required={required.has(name)}
              value={value[name]}
            />
          </div>
        );
      })}
    </div>
  );
}

function ObjectArrayControl({
  disabled,
  itemSchema,
  maxItems,
  minItems,
  name,
  onChange,
  path,
  value,
}: {
  disabled: boolean;
  itemSchema: SchemaProperty;
  maxItems: number | undefined;
  minItems: number | undefined;
  name: string;
  onChange: (value: unknown) => void;
  path: readonly (number | string)[];
  value: readonly unknown[];
}) {
  const itemName = singularize(humanize(name));
  const keyPrefix = useId();
  const nextKey = useRef(value.length);
  const [itemKeys, setItemKeys] = useState(() =>
    value.map((_, index) => `${keyPrefix}-${index}`)
  );
  return (
    <div {...stylex.props(styles.collection)}>
      {value.length === 0 ? (
        <p {...stylex.props(styles.collectionEmpty)}>No {name} configured.</p>
      ) : null}
      {value.map((item, index) => {
        const objectValue = isPlainObject(item) ? item : {};
        return (
          <section
            key={itemKeys[index]}
            {...stylex.props(styles.collectionItem)}
          >
            <header {...stylex.props(styles.collectionItemHeader)}>
              <h4 {...stylex.props(styles.collectionItemTitle)}>
                {collectionItemTitle(itemName, objectValue, index)}
              </h4>
              <IconButton
                aria-label={`Remove ${itemName} ${index + 1}`}
                disabled={
                  disabled ||
                  (minItems !== undefined && value.length <= minItems)
                }
                onClick={() => {
                  setItemKeys((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index)
                  );
                  onChange(value.filter((_, itemIndex) => itemIndex !== index));
                }}
                size="compact"
                variant="ghost"
              >
                <Trash2 />
              </IconButton>
            </header>
            <ObjectFieldsControl
              disabled={disabled}
              onChange={(nextValue) => {
                const next = [...value];
                next[index] = nextValue;
                onChange(next);
              }}
              path={[...path, index]}
              schema={itemSchema}
              value={objectValue}
            />
          </section>
        );
      })}
      <Button
        disabled={
          disabled || (maxItems !== undefined && value.length >= maxItems)
        }
        onClick={() => {
          const itemKey = `${keyPrefix}-${nextKey.current}`;
          nextKey.current += 1;
          setItemKeys((current) => [...current, itemKey]);
          onChange([...value, createSchemaValue(itemSchema)]);
        }}
        size="compact"
        variant="secondary"
        {...stylex.props(styles.collectionAction)}
      >
        <Plus size={13} strokeWidth={1.75} />
        Add {itemName}
      </Button>
    </div>
  );
}

function ScalarArrayControl({
  disabled,
  id,
  itemSchema,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  itemSchema: SchemaProperty | undefined;
  onChange: (value: unknown) => void;
  value: readonly unknown[];
}) {
  return (
    <TextArea.Root xstyle={styles.controlRoot}>
      <TextArea.Control
        disabled={disabled}
        id={id}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => parseScalar(item, itemSchema))
          )
        }
        placeholder="One value per line"
        rows={3}
        value={value.map(displayValue).join("\n")}
        xstyle={styles.textArea}
      />
    </TextArea.Root>
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
    <TextArea.Root xstyle={styles.controlRoot}>
      <TextArea.Control
        disabled={disabled}
        id={id}
        onBlur={() => {
          if (draft !== externalValue) {
            const parsed = parseObjectMap(draft);
            if (parsed) {
              onChange(parsed);
            }
          }
        }}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="key = value"
        rows={4}
        value={draft}
        xstyle={styles.textArea}
      />
    </TextArea.Root>
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

function schemaRequired(schema: JsonObject) {
  return new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (value): value is string => typeof value === "string"
        )
      : []
  );
}

function parseConfiguration(toml: string): Record<string, unknown> | null {
  try {
    return parse(toml);
  } catch {
    return null;
  }
}

function updateObjectValue(
  current: Record<string, unknown>,
  name: string,
  value: unknown
) {
  const next = Object.fromEntries(
    Object.entries(current).filter(([key]) => key !== name)
  );
  if (value !== undefined) {
    next[name] = value;
  }
  return next;
}

function deepMerge(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] =
      isPlainObject(value) && isPlainObject(defaults[key])
        ? deepMerge(defaults[key], value)
        : value;
  }
  return merged;
}

function createSchemaValue(schema: SchemaProperty): unknown {
  if (schema.const !== undefined) {
    return schema.const;
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  const firstOption = schema.enum?.[0];
  if (firstOption !== undefined) {
    return firstOption;
  }
  if (schema.type === "object" || schemaProperties(schema).length > 0) {
    const required = schemaRequired(schema);
    return schemaProperties(schema).reduce<Record<string, unknown>>(
      (value, [name, property]) => {
        if (required.has(name) || property.default !== undefined) {
          value[name] = createSchemaValue(property);
        }
        return value;
      },
      {}
    );
  }
  if (schema.type === "array") {
    return [];
  }
  if (schema.type === "boolean") {
    return false;
  }
  if (schema.type === "integer" || schema.type === "number") {
    return schema.minimum ?? 0;
  }
  return "";
}

function collectionItemTitle(
  itemName: string,
  value: Record<string, unknown>,
  index: number
) {
  for (const key of ["id", "name", "title", "model", "resource_uri", "uri"]) {
    if (typeof value[key] === "string" && value[key].length > 0) {
      return value[key];
    }
  }
  return `${itemName} ${index + 1}`;
}

function parseScalar(value: string, schema: SchemaProperty | undefined) {
  if (schema?.type === "integer" || schema?.type === "number") {
    return Number(value);
  }
  if (schema?.type === "boolean") {
    return value === "true";
  }
  return value;
}

function displayValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

function humanize(value: string) {
  const words = value.replaceAll(/[_.-]+/gu, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function singularize(value: string) {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }
  return value.endsWith("s") ? value.slice(0, -1) : value;
}

function fieldId(path: readonly (number | string)[]) {
  return `plugin-config-${path.join("-").replaceAll(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectMapText(value: Record<string, unknown>) {
  return stringify(value).trimEnd();
}

function parseObjectMap(value: string) {
  try {
    return parse(value);
  } catch {
    return null;
  }
}
