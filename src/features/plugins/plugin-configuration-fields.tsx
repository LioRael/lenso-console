import { Button } from "@lenso/ui/button";
import { IconButton } from "@lenso/ui/icon-button";
import { Select } from "@lenso/ui/select";
import { Switch } from "@lenso/ui/switch";
import { TextArea } from "@lenso/ui/text-area";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { Plus, Trash2 } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { parse, stringify } from "smol-toml";

import { lensoUiTokens as tokens } from "../../lenso-ui-token-refs.stylex";
import {
  ConfigurationFieldGroups,
  configurationFieldGroups,
} from "./configuration-field-groups";
import {
  ConfigurationFieldSearch,
  ConfigurationFieldMatch,
} from "./configuration-field-search";
import { editField, readField } from "./configuration-field-state";
import { expandConfigurationReferences } from "./configuration-schema-references";
import { ConfigurationStringControl } from "./configuration-string-control";
import {
  applyVariantConstants,
  configurationVariants,
  ConfigurationVariants,
} from "./configuration-variants";
import { resolveConfigurationSchema } from "./plugin-configuration-schema";
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
  maxProperties?: number;
  minProperties?: number;
  pattern?: string;
  properties?: JsonObject;
  required?: readonly JsonValue[];
  readOnly?: boolean;
  writeOnly?: boolean;
  title?: string;
  type?: string;
};

const unsetSelectValue = "__lenso_configuration_unset__";
const FieldSource = createContext<{
  defaults: Record<string, unknown>;
  overrides: Record<string, unknown>;
  disabled: boolean;
  update: (path: readonly string[], value: unknown) => void;
} | null>(null);

const styles = stylex.create({
  collection: {
    display: "grid",
    gap: tokens.space3,
    minWidth: 0,
  },
  collectionAction: { justifySelf: "end" },
  collectionActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: tokens.space2,
  },
  mapKey: { flex: 1, minWidth: 0 },
  collectionEmpty: {
    color: tokens.colorContentTertiary,
    fontSize: 11,
    lineHeight: "16px",
    margin: 0,
    paddingBlock: tokens.space2,
  },
  collectionItem: {
    borderColor: tokens.colorBorderTertiary,
    borderStyle: "solid",
    borderWidth: "0 0 1px",
    display: "grid",
    minWidth: 0,
    paddingBlock: tokens.space3,
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
    justifyContent: "flex-end",
    minHeight: 32,
  },
  textArea: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    minHeight: 78,
  },
});

type PluginConfigurationFieldsProps = {
  defaults: JsonObject;
  disabled: boolean;
  onChange: (toml: string) => void;
  schema: JsonObject;
  toml: string;
};

export function PluginConfigurationFields(
  props: PluginConfigurationFieldsProps
) {
  const schema = useMemo(
    () => expandConfigurationReferences(props.schema),
    [props.schema]
  );
  const parsed = useMemo(() => parseConfiguration(props.toml), [props.toml]);
  if (!parsed) {
    return <ConfigurationFieldsForm {...props} schema={schema} />;
  }
  return (
    <ConfigurationVariants
      schema={schema}
      value={deepMerge(props.defaults, parsed)}
      disabled={props.disabled}
      onSelect={(selected) => {
        const next = applyVariantConstants(parsed, selected);
        if (next !== parsed && isPlainObject(next)) {
          props.onChange(stringify(next));
        }
      }}
    >
      {(selected) => <ConfigurationFieldsForm {...props} schema={selected} />}
    </ConfigurationVariants>
  );
}

function ConfigurationFieldsForm({
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
  const parsed = useMemo(() => parseConfiguration(toml), [toml]);
  const values = useMemo(
    () => deepMerge(defaults, parsed ?? {}),
    [defaults, parsed]
  );
  const resolved = useMemo(
    () => resolveConfigurationSchema(schema, values),
    [schema, values]
  );
  const readOnly = resolved?.readOnly === true;
  const fieldSource = useMemo(
    () => ({
      defaults,
      overrides: parsed ?? {},
      disabled: disabled || readOnly,
      update: (path: readonly string[], value: unknown) => {
        if (parsed) {
          onChange(stringify(editField(parsed, path, value)));
        }
      },
    }),
    [defaults, parsed, disabled, readOnly, onChange]
  );
  if (!parsed) {
    return (
      <p role="alert" {...stylex.props(styles.empty)}>
        The current configuration is not valid TOML. Fix it in Advanced before
        using fields.
      </p>
    );
  }
  if (!resolved || resolved.writeOnly === true) {
    return <AdvancedFieldsNotice />;
  }
  const properties = schemaProperties(resolved);
  const groups = configurationFieldGroups(schema, resolved, values);
  const propertyByName = new Map(properties);
  const required = schemaRequired(resolved);
  if (
    properties.length === 0 &&
    !isPlainObject(resolved.additionalProperties)
  ) {
    return (
      <p {...stylex.props(styles.empty)}>
        This Plugin does not declare editable fields.
      </p>
    );
  }

  const update = (name: string, value: unknown) => {
    onChange(stringify(updateObjectValue(parsed, name, value)));
  };

  return (
    <FieldSource value={fieldSource}>
      <div {...stylex.props(styles.fields)}>
        <ConfigurationFieldSearch
          schema={resolved}
          groups={groups.map((group) => group.schema)}
        >
          <ConfigurationFieldGroups
            groups={groups}
            renderField={(name) => {
              const property = propertyByName.get(name);
              return property ? (
                <ConfigurationField
                  disabled={disabled || resolved.readOnly === true}
                  key={name}
                  name={name}
                  onChange={(value) => update(name, value)}
                  path={[name]}
                  property={property}
                  required={required.has(name)}
                  value={values[name]}
                />
              ) : null;
            }}
          />
          {isPlainObject(resolved.additionalProperties) ? (
            <ConfigurationFieldMatch
              schema={resolved.additionalProperties}
              path={["Additional entries"]}
            >
              <TypedMapControl
                disabled={disabled || resolved.readOnly === true}
                onChange={(value) =>
                  onChange(stringify(value as Record<string, unknown>))
                }
                path={[]}
                schema={resolved as SchemaProperty}
                value={parsed}
              />
            </ConfigurationFieldMatch>
          ) : null}
        </ConfigurationFieldSearch>
      </div>
    </FieldSource>
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
    <ConfigurationFieldMatch schema={property} path={path}>
      <div {...stylex.props(styles.field)}>
        <FieldCopy
          disabled={disabled}
          id={id}
          name={name}
          path={path}
          property={property}
          required={required}
        />
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
    </ConfigurationFieldMatch>
  );
}

function FieldCopy({
  disabled,
  id,
  name,
  path,
  property,
  required,
}: {
  disabled: boolean;
  id: string;
  name: string;
  path: readonly (number | string)[];
  property: SchemaProperty;
  required: boolean;
}) {
  const source = useContext(FieldSource);
  const overridden = source && readField(source.overrides, path) !== undefined;
  const inherited = source && readField(source.defaults, path) !== undefined;
  const effective = resolveConfigurationSchema(
    property,
    source
      ? readField(deepMerge(source.defaults, source.overrides), path)
      : undefined
  );
  const readOnly = effective
    ? effective.readOnly === true || effective.const !== undefined
    : configurationVariants(property, undefined) === null;
  return (
    <div {...stylex.props(styles.fieldCopy)}>
      <label htmlFor={id} {...stylex.props(styles.fieldName)}>
        {property.title ?? humanize(name)}
        {property.readOnly ? (
          <span {...stylex.props(styles.fieldOptional)}>Read only</span>
        ) : property.deprecated ? (
          <span {...stylex.props(styles.fieldOptional)}>Deprecated</span>
        ) : required ? null : (
          <span {...stylex.props(styles.fieldOptional)}>Optional</span>
        )}
      </label>
      {property.description ? (
        <p {...stylex.props(styles.description)}>{property.description}</p>
      ) : null}
      {source ? (
        <div {...stylex.props(styles.fieldCopy)}>
          <span {...stylex.props(styles.description)}>
            {readOnly
              ? "Read only"
              : overridden
                ? "Overridden"
                : inherited
                  ? "Inherited"
                  : "Not configured"}
          </span>
          {overridden &&
          !readOnly &&
          path.every((key) => typeof key === "string") ? (
            <Button
              size="compact"
              variant="ghost"
              disabled={disabled || source.disabled}
              onClick={() => source.update(path as string[], undefined)}
              aria-label={`Reset ${property.title ?? humanize(name)}`}
              {...stylex.props(styles.collectionAction)}
            >
              {inherited ? "Use inherited value" : "Remove override"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ConfigurationControlProps = {
  disabled: boolean;
  id: string;
  name: string;
  onChange: (value: unknown) => void;
  path: readonly (number | string)[];
  property: SchemaProperty;
  required: boolean;
  value: unknown;
};

function AdvancedFieldsNotice() {
  return (
    <p {...stylex.props(styles.empty)}>
      This schema needs Advanced editing. Existing values are preserved.
    </p>
  );
}

function ConfigurationControl(props: ConfigurationControlProps) {
  const source = useContext(FieldSource);
  return (
    <ConfigurationVariants
      schema={props.property}
      value={props.value}
      disabled={props.disabled}
      onSelect={(selected) => {
        if (source && props.path.every((key) => typeof key === "string")) {
          const previous = readField(source.overrides, props.path);
          const next = applyVariantConstants(previous, selected);
          if (next !== previous) {
            source.update(props.path as string[], next);
          }
        } else {
          const next = applyVariantConstants(props.value, selected);
          if (next !== props.value) {
            props.onChange(next);
          }
        }
      }}
    >
      {(selected) => (
        <ResolvedConfigurationControl
          {...props}
          property={selected as SchemaProperty}
        />
      )}
    </ConfigurationVariants>
  );
}

function ResolvedConfigurationControl(props: ConfigurationControlProps) {
  const resolved = resolveConfigurationSchema(props.property, props.value);
  if (!resolved) {
    return <AdvancedFieldsNotice />;
  }
  const property = resolved as SchemaProperty;
  if (
    property.type !== undefined &&
    !["string", "boolean", "number", "integer", "array", "object"].includes(
      property.type
    )
  ) {
    return <AdvancedFieldsNotice />;
  }
  const disabled =
    props.disabled ||
    property.readOnly === true ||
    property.const !== undefined;
  if (property.writeOnly || property.format === "password") {
    if (property.type !== undefined && property.type !== "string") {
      return <AdvancedFieldsNotice />;
    }
    return (
      <FieldFeedback id={props.id} value={props.value}>
        <SensitiveControl {...props} property={property} disabled={disabled} />
      </FieldFeedback>
    );
  }
  return (
    <FieldFeedback
      id={props.id}
      value={props.value}
      active={
        !["array", "object", "number", "integer"].includes(
          property.type ?? ""
        ) && schemaProperties(property).length === 0
      }
    >
      <ConfigurationValueControl
        {...props}
        property={property}
        disabled={disabled}
      />
    </FieldFeedback>
  );
}

function FieldFeedback({
  id,
  value,
  active = true,
  children,
}: {
  id: string;
  value: unknown;
  active?: boolean;
  children: ReactNode;
}) {
  const [failure, setFailure] = useState<{
    value: unknown;
    message: string;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const error =
    failure && Object.is(failure.value, value) ? failure.message : "";
  useEffect(() => {
    const input = root.current?.querySelector("input, textarea");
    if (input) {
      if (error) {
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", `${id}-error`);
      } else {
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }
    }
  }, [error, id]);
  if (!active) {
    return children;
  }
  return (
    <div
      ref={root}
      onBlurCapture={(event) => {
        const input = event.target;
        if (
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement
        ) {
          const message = input.validity.valid
            ? ""
            : input.validity.valueMissing
              ? "This field is required."
              : input.validity.tooShort
                ? "This value is too short."
                : input.validity.tooLong
                  ? "This value is too long."
                  : input.validity.patternMismatch
                    ? "Use the required format."
                    : "Enter a valid value.";
          setFailure({ value, message });
        }
      }}
      onChangeCapture={() => setFailure(null)}
    >
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          {...stylex.props(styles.description)}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SensitiveControl({
  disabled,
  id,
  name,
  onChange,
  property,
  required,
  value,
}: ConfigurationControlProps) {
  const [draft, setDraft] = useState("");
  // Never hydrate a write-only value returned by the provider into an input.
  const displayedDraft = draft === value ? draft : "";
  return (
    <TextField.Root size="compact" xstyle={styles.controlRoot}>
      <TextField.Control
        aria-label={property.title ?? humanize(name)}
        autoComplete="new-password"
        disabled={disabled}
        id={id}
        maxLength={property.maxLength}
        minLength={property.minLength}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          onChange(next === "" && !required ? undefined : next);
        }}
        placeholder={
          value === undefined || value === ""
            ? "Not set"
            : "Configured — enter a replacement"
        }
        required={required && value === undefined}
        spellCheck={false}
        type="password"
        value={displayedDraft}
      />
    </TextField.Root>
  );
}

function ConfigurationValueControl({
  disabled,
  id,
  name,
  onChange,
  path,
  property,
  required,
  value,
}: ConfigurationControlProps) {
  if (property.const !== undefined) {
    if (property.const !== null && typeof property.const === "object") {
      return <AdvancedFieldsNotice />;
    }
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
        <Select.Trigger
          aria-label={property.title ?? humanize(name)}
          id={id}
          xstyle={styles.selectTrigger}
        >
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
      <NumberControl
        key={typeof value === "number" ? value : "unset"}
        disabled={disabled}
        id={id}
        name={name}
        onChange={onChange}
        path={path}
        property={property}
        required={required}
        value={value}
      />
    );
  }
  if (property.type === "array") {
    const items = Array.isArray(value) ? value : [];
    if (
      !isPlainObject(property.items) ||
      property.prefixItems !== undefined ||
      Array.isArray(property.items)
    ) {
      return <AdvancedFieldsNotice />;
    }
    return (
      <ArrayControl
        disabled={disabled || property.items.readOnly === true}
        itemSchema={property.items}
        maxItems={property.maxItems}
        minItems={property.minItems}
        name={name}
        onChange={onChange}
        path={path}
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
      <TypedMapControl
        disabled={disabled}
        path={path}
        schema={property}
        onChange={onChange}
        value={isPlainObject(value) ? value : {}}
      />
    );
  }
  return (
    <ConfigurationStringControl
      disabled={disabled}
      id={id}
      label={property.title ?? humanize(name)}
      minLength={property.minLength}
      maxLength={property.maxLength}
      pattern={property.pattern}
      placeholder={property.format === "uri" ? "https://…" : undefined}
      required={required}
      value={value}
      onChange={onChange}
    />
  );
}

function NumberControl({
  disabled,
  id,
  name,
  onChange,
  property,
  required,
  value,
}: ConfigurationControlProps) {
  const external = typeof value === "number" ? String(value) : "";
  const [draft, setDraft] = useState(external);
  const [error, setError] = useState(false);
  return (
    <div>
      <TextField.Root size="compact" xstyle={styles.controlRoot}>
        <TextField.Control
          aria-label={property.title ?? humanize(name)}
          disabled={disabled}
          id={id}
          type="number"
          value={draft}
          min={property.minimum}
          max={property.maximum}
          step={property.type === "integer" ? 1 : "any"}
          required={required}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.validity.valid ||
              (draft !== "" && !Number.isFinite(Number(draft)))
            ) {
              setDraft(external);
              setError(true);
              return;
            }
            onChange(draft === "" ? undefined : Number(draft));
          }}
        />
      </TextField.Root>
      {error ? (
        <p role="alert" {...stylex.props(styles.description)}>
          Enter a valid number within the allowed range. The value is unchanged.
        </p>
      ) : null}
    </div>
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
  const source = useContext(FieldSource);
  const resolved = resolveConfigurationSchema(schema, value);
  if (!resolved || resolved.writeOnly === true) {
    return <AdvancedFieldsNotice />;
  }
  const required = schemaRequired(resolved);
  return (
    <div {...stylex.props(styles.nestedFields)}>
      {schemaProperties(resolved).map(([name, property]) => {
        const nestedPath = [...path, name];
        const id = fieldId(nestedPath);
        return (
          <ConfigurationFieldMatch
            key={name}
            schema={property}
            path={nestedPath}
          >
            <div {...stylex.props(styles.nestedField)}>
              <FieldCopy
                disabled={disabled || resolved.readOnly === true}
                id={id}
                name={name}
                path={nestedPath}
                property={property}
                required={required.has(name)}
              />
              <ConfigurationControl
                disabled={disabled || resolved.readOnly === true}
                id={id}
                name={name}
                onChange={(nextValue) =>
                  source && nestedPath.every((key) => typeof key === "string")
                    ? source.update(nestedPath as string[], nextValue)
                    : onChange(updateObjectValue(value, name, nextValue))
                }
                path={nestedPath}
                property={property}
                required={required.has(name)}
                value={value[name]}
              />
            </div>
          </ConfigurationFieldMatch>
        );
      })}
      {isPlainObject(resolved.additionalProperties) ? (
        <ConfigurationFieldMatch
          schema={resolved.additionalProperties}
          path={[...path, "Additional entries"]}
        >
          <TypedMapControl
            disabled={disabled || resolved.readOnly === true}
            onChange={onChange}
            path={path}
            schema={resolved as SchemaProperty}
            value={value}
          />
        </ConfigurationFieldMatch>
      ) : null}
    </div>
  );
}

function ArrayControl({
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
  const visibleKeys = value.map(
    (_, index) => itemKeys[index] ?? `${keyPrefix}-external-${index}`
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
            key={visibleKeys[index]}
            {...stylex.props(styles.collectionItem)}
          >
            <header {...stylex.props(styles.collectionItemHeader)}>
              <h4 {...stylex.props(styles.collectionItemTitle)}>
                {collectionItemTitle(itemName, objectValue, index, itemSchema)}
              </h4>
              <div {...stylex.props(styles.collectionActions)}>
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${itemName} ${index + 1} up`}
                  onClick={() => {
                    const next = [...value];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    setItemKeys(() => {
                      const keys = [...visibleKeys];
                      [keys[index - 1], keys[index]] = [
                        keys[index]!,
                        keys[index - 1]!,
                      ];
                      return keys;
                    });
                    onChange(next);
                  }}
                >
                  Move up
                </Button>
                <IconButton
                  aria-label={`Remove ${itemName} ${index + 1}`}
                  disabled={
                    disabled ||
                    (minItems !== undefined && value.length <= minItems)
                  }
                  onClick={() => {
                    setItemKeys(() =>
                      visibleKeys.filter((_, itemIndex) => itemIndex !== index)
                    );
                    onChange(
                      value.filter((_, itemIndex) => itemIndex !== index)
                    );
                  }}
                  size="compact"
                  variant="ghost"
                >
                  <Trash2 />
                </IconButton>
              </div>
            </header>
            <ConfigurationControl
              disabled={disabled}
              id={fieldId([...path, index])}
              name={`${itemName} ${index + 1}`}
              required
              onChange={(nextValue) => {
                const next = [...value];
                next[index] = nextValue;
                onChange(next);
              }}
              path={[...path, index]}
              property={itemSchema}
              value={item}
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
          setItemKeys([...visibleKeys, itemKey]);
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

function TypedMapControl({
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
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");
  const itemSchema = schema.additionalProperties;
  if (!isPlainObject(itemSchema)) {
    return schema.additionalProperties === false ? (
      <p {...stylex.props(styles.collectionEmpty)}>
        No additional fields allowed.
      </p>
    ) : (
      <ObjectMapControl
        disabled={disabled}
        id={fieldId(path)}
        onChange={onChange}
        value={value}
      />
    );
  }
  const fixedNames = new Set(schemaProperties(schema).map(([name]) => name));
  const requiredKeys = schemaRequired(schema);
  const entries = Object.entries(value).filter(([key]) => !fixedNames.has(key));
  const locked = disabled || itemSchema.readOnly === true;
  const full =
    schema.maxProperties !== undefined &&
    Object.keys(value).length >= schema.maxProperties;
  return (
    <div {...stylex.props(styles.collection)}>
      {entries.map(([key, entry]) => (
        <section key={key} {...stylex.props(styles.collectionItem)}>
          <header {...stylex.props(styles.collectionItemHeader)}>
            <MapKey
              name={key}
              disabled={locked || requiredKeys.has(key)}
              onRename={(next) => {
                if (next === key) {
                  return true;
                }
                if (
                  !next ||
                  requiredKeys.has(key) ||
                  Object.hasOwn(value, next) ||
                  fixedNames.has(next)
                ) {
                  return false;
                }
                onChange(
                  Object.fromEntries(
                    Object.entries(value).map(([name, item]) => [
                      name === key ? next : name,
                      item,
                    ])
                  )
                );
                return true;
              }}
            />
            <IconButton
              aria-label={`Remove ${key}`}
              size="compact"
              variant="ghost"
              disabled={
                locked ||
                requiredKeys.has(key) ||
                (schema.minProperties !== undefined &&
                  Object.keys(value).length <= schema.minProperties)
              }
              onClick={() => onChange(updateObjectValue(value, key, undefined))}
            >
              <Trash2 />
            </IconButton>
          </header>
          <ConfigurationControl
            disabled={locked}
            id={fieldId([...path, key])}
            name={key}
            onChange={(next) => onChange(updateObjectValue(value, key, next))}
            path={[...path, key]}
            property={itemSchema as SchemaProperty}
            required
            value={entry}
          />
        </section>
      ))}
      <div {...stylex.props(styles.collectionItemHeader)}>
        <TextField.Root size="compact" xstyle={styles.mapKey}>
          <TextField.Control
            aria-label={`New ${humanize(String(path.at(-1) ?? "configuration"))} key`}
            disabled={locked || full}
            placeholder="New key"
            value={newKey}
            onChange={(event) => {
              setNewKey(event.target.value);
              setError("");
            }}
          />
        </TextField.Root>
        <Button
          size="compact"
          variant="secondary"
          disabled={locked || full || !newKey}
          onClick={() => {
            if (Object.hasOwn(value, newKey) || fixedNames.has(newKey)) {
              setError("This key already exists.");
              return;
            }
            onChange(
              updateObjectValue(
                value,
                newKey,
                createSchemaValue(itemSchema as SchemaProperty)
              )
            );
            setNewKey("");
            setError("");
          }}
        >
          Add entry
        </Button>
      </div>
      {error ? (
        <p role="alert" {...stylex.props(styles.description)}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MapKey({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled: boolean;
  onRename: (name: string) => boolean;
}) {
  const [draft, setDraft] = useState(name);
  const [invalid, setInvalid] = useState(false);
  return (
    <div {...stylex.props(styles.mapKey)}>
      <TextField.Root size="compact">
        <TextField.Control
          aria-label={`Key ${name}`}
          aria-invalid={invalid}
          disabled={disabled}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={() => {
            if (!onRename(draft)) {
              setInvalid(true);
              setDraft(name);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </TextField.Root>
      {invalid ? (
        <p role="alert" {...stylex.props(styles.description)}>
          Use a non-empty, unique key. The original key is unchanged.
        </p>
      ) : null}
    </div>
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
  return Object.fromEntries([
    ...Object.entries(current).filter(([key]) => key !== name),
    ...(value === undefined ? [] : [[name, value]]),
  ]);
}

function deepMerge(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries([
    ...Object.entries(defaults),
    ...Object.entries(overrides).map(([key, value]) => [
      key,
      isPlainObject(value) &&
      Object.hasOwn(defaults, key) &&
      isPlainObject(defaults[key])
        ? deepMerge(defaults[key], value)
        : value,
    ]),
  ]);
}

function createSchemaValue(inputSchema: SchemaProperty): unknown {
  const schema = (resolveConfigurationSchema(inputSchema, undefined) ??
    inputSchema) as SchemaProperty;
  if (schema.const !== undefined) {
    return schema.const;
  }
  if (schema.default !== undefined && schema.default !== null) {
    return schema.default;
  }
  const firstOption = schema.enum?.find((option) => option !== null);
  if (firstOption !== undefined) {
    return firstOption;
  }
  if (schema.type === "object" || schemaProperties(schema).length > 0) {
    const required = schemaRequired(schema);
    return schemaProperties(schema).reduce<Record<string, unknown>>(
      (value, [name, property]) => {
        if (
          !property.readOnly &&
          !property.writeOnly &&
          property.format !== "password" &&
          (required.has(name) || property.default !== undefined)
        ) {
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
  index: number,
  schema: SchemaProperty
) {
  const resolved = resolveConfigurationSchema(schema, value);
  for (const key of ["id", "name", "title", "model", "resource_uri", "uri"]) {
    const property = schemaProperties(resolved ?? {}).find(
      ([name]) => name === key
    )?.[1];
    if (
      property &&
      !property.writeOnly &&
      property.format !== "password" &&
      typeof value[key] === "string" &&
      value[key].length > 0
    ) {
      return value[key];
    }
  }
  return `${itemName} ${index + 1}`;
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
