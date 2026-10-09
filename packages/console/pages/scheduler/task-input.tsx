import { Button } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import { Select } from "@lenso/ui/select";
import { TextField } from "@lenso/ui/textfield";
import { useState } from "react";
import { z } from "zod";

type InputKind =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";
export interface TaskInputModel {
  kind: InputKind;
  title?: string;
  description?: string;
  required: boolean;
  validator: z.ZodType;
  children?: Readonly<Record<string, TaskInputModel>>;
  item?: TaskInputModel;
  choices?: readonly string[];
  min?: number;
  max?: number;
}

const jsonObject = z.record(z.string(), z.unknown());
const stringArray = z.array(z.string());
const bound = z.number().finite();
const annotationKeys = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
]);

/** Unsupported JSON Schema constraints disable creation rather than weakening validation. */
export function taskInputModel(
  raw: unknown,
  required = true,
  depth = 0
): TaskInputModel | null {
  if (depth > 8) {
    return null;
  }
  const parsed = jsonObject.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const node = parsed.data;
  const kind = z
    .enum(["object", "array", "string", "number", "integer", "boolean", "null"])
    .safeParse(node.type);
  if (!kind.success) {
    return null;
  }
  const supported = new Set([
    "type",
    ...(kind.data === "object"
      ? ["properties", "required", "additionalProperties"]
      : kind.data === "array"
        ? ["items", "minItems", "maxItems"]
        : kind.data === "string"
          ? ["enum", "minLength", "maxLength", "pattern", "format"]
          : kind.data === "number" || kind.data === "integer"
            ? [
                "minimum",
                "maximum",
                "exclusiveMinimum",
                "exclusiveMaximum",
                "multipleOf",
              ]
            : []),
  ]);
  if (
    Object.keys(node).some(
      (key) => !supported.has(key) && !annotationKeys.has(key)
    )
  ) {
    return null;
  }
  const base = {
    kind: kind.data,
    required,
    title: typeof node.title === "string" ? node.title : undefined,
    description:
      typeof node.description === "string" ? node.description : undefined,
  };
  if (kind.data === "object") {
    const properties = jsonObject.safeParse(node.properties ?? {});
    const requiredNames = stringArray.safeParse(node.required ?? []);
    if (
      !properties.success ||
      !requiredNames.success ||
      Object.keys(properties.data).length > 100 ||
      (node.additionalProperties !== undefined &&
        node.additionalProperties !== false)
    ) {
      return null;
    }
    const childEntries = new Map<string, TaskInputModel>();
    const validators = new Map<string, z.ZodType>();
    for (const [name, schema] of Object.entries(properties.data)) {
      const child = taskInputModel(
        schema,
        requiredNames.data.includes(name),
        depth + 1
      );
      if (!child) {
        return null;
      }
      childEntries.set(name, child);
      validators.set(
        name,
        child.required ? child.validator : child.validator.optional()
      );
    }
    if (requiredNames.data.some((name) => !childEntries.has(name))) {
      return null;
    }
    return {
      ...base,
      children: Object.fromEntries(childEntries),
      validator: z.strictObject(Object.fromEntries(validators)),
    };
  }
  if (kind.data === "array") {
    const item = taskInputModel(node.items, true, depth + 1);
    if (!item) {
      return null;
    }
    const min = z
      .number()
      .int()
      .nonnegative()
      .safeParse(node.minItems ?? 0);
    const max = z
      .number()
      .int()
      .nonnegative()
      .safeParse(node.maxItems ?? 100);
    if (!min.success || !max.success) {
      return null;
    }
    const minimum = min.data;
    const maximum = max.data;
    if (maximum < minimum || minimum > 100) {
      return null;
    }
    return {
      ...base,
      item,
      min: minimum,
      max: Math.min(maximum, 100),
      validator: z.array(item.validator).min(minimum).max(maximum),
    };
  }
  if (kind.data === "string") {
    let validator = z.string();
    if (node.minLength !== undefined) {
      const min = z.number().int().nonnegative().safeParse(node.minLength);
      if (!min.success) {
        return null;
      }
      validator = validator.min(min.data);
    }
    if (node.maxLength !== undefined) {
      const max = z.number().int().nonnegative().safeParse(node.maxLength);
      if (!max.success) {
        return null;
      }
      validator = validator.max(max.data);
    }
    if (node.pattern !== undefined) {
      if (typeof node.pattern !== "string") {
        return null;
      }
      try {
        validator = validator.regex(new RegExp(node.pattern));
      } catch {
        return null;
      }
    }
    if (node.format !== undefined) {
      if (node.format === "email") {
        validator = validator.email();
      } else if (node.format === "uuid") {
        validator = validator.uuid();
      } else if (node.format === "uri") {
        validator = validator.url();
      } else if (node.format === "date-time") {
        validator = validator.datetime({ offset: true });
      } else {
        return null;
      }
    }
    if (node.enum !== undefined) {
      const choices = stringArray.safeParse(node.enum);
      if (
        !choices.success ||
        !choices.data.length ||
        choices.data.length > 100
      ) {
        return null;
      }
      return {
        ...base,
        choices: choices.data,
        validator: validator.refine((value) => choices.data.includes(value)),
      };
    }
    return { ...base, validator };
  }
  if (kind.data === "number" || kind.data === "integer") {
    let validator = kind.data === "integer" ? z.number().int() : z.number();
    for (const key of [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
    ]) {
      if (node[key] === undefined) {
        continue;
      }
      const value = bound.safeParse(node[key]);
      if (!value.success || (key === "multipleOf" && value.data <= 0)) {
        return null;
      }
      if (key === "minimum") {
        validator = validator.min(value.data);
      } else if (key === "maximum") {
        validator = validator.max(value.data);
      } else if (key === "exclusiveMinimum") {
        validator = validator.gt(value.data);
      } else if (key === "exclusiveMaximum") {
        validator = validator.lt(value.data);
      } else {
        validator = validator.multipleOf(value.data);
      }
    }
    return { ...base, validator };
  }
  return {
    ...base,
    validator: kind.data === "boolean" ? z.boolean() : z.null(),
  };
}

export function initialTaskInput(model: TaskInputModel): unknown {
  if (model.kind === "object") {
    return Object.fromEntries(
      Object.entries(model.children ?? {})
        .filter(([, child]) => child.required)
        .map(([name, child]) => [name, initialTaskInput(child)])
    );
  }
  if (model.kind === "array") {
    return Array.from({ length: model.min ?? 0 }, () =>
      model.item ? initialTaskInput(model.item) : undefined
    );
  }
  if (model.kind === "null") {
    return null;
  }
  return undefined;
}

export function ScheduleSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="management-field">
      <span>{label}</span>
      <Select.Root
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(next);
          }
        }}
        disabled={disabled}
        required={required}
      >
        <Select.Trigger aria-label={label}>
          <Select.Value>
            {options.find((option) => option.value === value)?.label ?? label}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner alignItemWithTrigger={false}>
            <Select.Popup>
              <Select.List>
                {options.map((option) => (
                  <Select.Item key={option.value} value={option.value}>
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

interface TaskInputFieldsProps {
  model: TaskInputModel;
  value: unknown;
  onChange(value: unknown): void;
  name: string;
  zh: boolean;
  disabled: boolean;
}

function OptionalTaskInput(props: TaskInputFieldsProps) {
  const [included, setIncluded] = useState(props.value !== undefined);
  const label = props.model.title ?? props.name;
  if (!included && props.value === undefined) {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled={props.disabled}
        onClick={() => {
          setIncluded(true);
          props.onChange(initialTaskInput(props.model));
        }}
      >
        {props.zh ? `添加可选字段：${label}` : `Add optional field: ${label}`}
      </Button>
    );
  }
  return (
    <div className="management-form">
      <TaskInputFields {...props} model={{ ...props.model, required: true }} />
      <Button
        type="button"
        variant="ghost"
        disabled={props.disabled}
        onClick={() => {
          setIncluded(false);
          props.onChange(undefined);
        }}
      >
        {props.zh
          ? `移除可选字段：${label}`
          : `Remove optional field: ${label}`}
      </Button>
    </div>
  );
}

export function TaskInputFields({
  model,
  value,
  onChange,
  name,
  zh,
  disabled,
}: TaskInputFieldsProps) {
  if (!model.required) {
    return (
      <OptionalTaskInput
        model={model}
        value={value}
        onChange={onChange}
        name={name}
        zh={zh}
        disabled={disabled}
      />
    );
  }
  const label = model.title ?? name;
  if (model.kind === "object") {
    const parsed = jsonObject.safeParse(value);
    const fields = parsed.success ? parsed.data : {};
    return (
      <fieldset className="management-form" disabled={disabled}>
        <legend>{label}</legend>
        {model.description && (
          <p className="management-muted">{model.description}</p>
        )}
        {Object.entries(model.children ?? {}).map(([key, child]) => (
          <TaskInputFields
            key={key}
            model={child}
            value={fields[key]}
            name={key}
            zh={zh}
            disabled={disabled}
            onChange={(next) => onChange({ ...fields, [key]: next })}
          />
        ))}
      </fieldset>
    );
  }
  if (model.kind === "array" && model.item) {
    const parsed = z.array(z.unknown()).safeParse(value);
    const items = parsed.success ? parsed.data : [];
    const { item } = model;
    return (
      <fieldset className="management-form" disabled={disabled}>
        <legend>{label}</legend>
        {items.map((entry, index) => (
          <div className="management-detail" key={index}>
            <TaskInputFields
              model={item}
              value={entry}
              name={`${label} ${index + 1}`}
              zh={zh}
              disabled={disabled}
              onChange={(next) =>
                onChange(
                  items.map((current, at) => (at === index ? next : current))
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || items.length <= (model.min ?? 0)}
              onClick={() => onChange(items.filter((_, at) => at !== index))}
            >
              {zh ? "移除条目" : "Remove item"}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || items.length >= (model.max ?? 100)}
          onClick={() => onChange([...items, initialTaskInput(item)])}
        >
          {zh ? "添加条目" : "Add item"}
        </Button>
      </fieldset>
    );
  }
  if (model.kind === "boolean") {
    return (
      <ScheduleSelect
        label={label}
        disabled={disabled}
        value={typeof value === "boolean" ? String(value) : null}
        required={model.required}
        options={[
          { value: "true", label: zh ? "是" : "Yes" },
          { value: "false", label: zh ? "否" : "No" },
        ]}
        onChange={(next) => onChange(next === "true")}
      />
    );
  }
  if (model.choices) {
    return (
      <ScheduleSelect
        label={label}
        disabled={disabled}
        value={typeof value === "string" ? value : null}
        required={model.required}
        options={model.choices.map((choice) => ({
          value: choice,
          label: choice,
        }))}
        onChange={onChange}
      />
    );
  }
  if (model.kind === "null") {
    return <p className="management-muted">{label}: null</p>;
  }
  return (
    <label className="management-field">
      {label}
      {!model.required && (
        <span className="management-muted">
          {zh ? "（可选）" : " (optional)"}
        </span>
      )}
      <TextField.Root>
        <Input
          disabled={disabled}
          required={model.required}
          type={
            model.kind === "number" || model.kind === "integer"
              ? "number"
              : "text"
          }
          step={model.kind === "integer" ? 1 : "any"}
          value={
            typeof value === "string" || typeof value === "number" ? value : ""
          }
          onChange={(event) =>
            onChange(
              event.target.value === "" && !model.required
                ? undefined
                : model.kind === "number" || model.kind === "integer"
                  ? event.target.value === ""
                    ? undefined
                    : event.target.valueAsNumber
                  : event.target.value
            )
          }
        />
      </TextField.Root>
      {model.description && (
        <span className="management-muted">{model.description}</span>
      )}
    </label>
  );
}
