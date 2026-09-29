import { TextField } from "@lenso/ui/text-field";

type Primitive = {
  type: "string" | "number" | "integer" | "boolean";
  title?: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
};

export function ParameterFields({
  schemaJson,
  inputJson,
  disabled,
  onChange,
}: {
  schemaJson: string;
  inputJson: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  let fields: [string, Primitive][];
  let input: Record<string, unknown>;
  try {
    const schema: { type?: string; properties?: Record<string, Primitive> } =
      JSON.parse(schemaJson);
    const value: unknown = JSON.parse(inputJson);
    if (
      schema.type !== "object" ||
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return null;
    }
    input = value as Record<string, unknown>;
    fields = Object.entries(schema.properties ?? {}).filter(
      ([, field]) =>
        field && ["string", "number", "integer", "boolean"].includes(field.type)
    );
  } catch {
    return null;
  }
  const update = (key: string, value: unknown) =>
    onChange(JSON.stringify({ ...input, [key]: value }, null, 2));
  return fields.map(([key, field]) => {
    const label = field.title || key;
    const value = input[key];
    return (
      <label key={key}>
        <span>{label}</span>
        {field.type === "boolean" ? (
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => update(key, event.target.checked)}
          />
        ) : field.enum?.every((option) => typeof option === "string") ? (
          <select
            aria-label={label}
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            onChange={(event) => update(key, event.target.value)}
          >
            <option value="">—</option>
            {field.enum.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <TextField.Root>
            <TextField.Control
              type={field.type === "string" ? "text" : "number"}
              step={field.type === "integer" ? 1 : "any"}
              min={field.minimum}
              max={field.maximum}
              maxLength={field.maxLength ?? 262144}
              value={
                typeof value === "string" || typeof value === "number"
                  ? String(value)
                  : ""
              }
              disabled={disabled}
              onChange={(event) => {
                const text = event.target.value;
                const numeric = Number(text);
                update(
                  key,
                  field.type === "string" ||
                    text === "" ||
                    !Number.isFinite(numeric)
                    ? text
                    : numeric
                );
              }}
            />
          </TextField.Root>
        )}
        {field.description && <small>{field.description}</small>}
      </label>
    );
  });
}
