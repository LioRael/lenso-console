import { Button } from "@lenso/ui/button";
import { Switch } from "@lenso/ui/switch";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { profileStyles as ui } from "./agent-profile-editor.stylex";
import type { ProfileDocument } from "./agent-profile-model";
import { listAvailableSkills } from "./agent-runtime";

export function AgentProfileSkills({
  agentId,
  document,
  disabled,
  onChange,
}: {
  agentId: string;
  document: ProfileDocument;
  disabled: boolean;
  onChange: (document: ProfileDocument) => void;
}) {
  const skills = useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: ({ signal }) => listAvailableSkills(signal, agentId),
    staleTime: 30_000,
    retry: false,
  });
  const [query, setQuery] = useState("");
  const selected = Array.isArray(document.allowed_skills)
    ? document.allowed_skills.filter(
        (name): name is string => typeof name === "string"
      )
    : undefined;
  const enabled = (name: string) =>
    selected === undefined || selected.includes(name);
  const all = skills.data ?? [];
  const visible = all.filter((item) =>
    [item.name, item.description, item.directory]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const update = (names: string[]) =>
    onChange({ ...document, allowed_skills: [...new Set(names)].sort() });
  return (
    <section {...stylex.props(ui.capabilities)} aria-label="Profile Skills">
      <header {...stylex.props(ui.capabilityHeading)}>
        <div>
          <h3 {...stylex.props(ui.fieldTitle)}>Skills</h3>
          <p {...stylex.props(ui.hint)}>
            Choose which Skills this Profile can discover and use.
          </p>
        </div>
      </header>
      <div {...stylex.props(ui.listToolbar)}>
        <div>
          <strong {...stylex.props(ui.fieldTitle)}>
            Use all common Skills
          </strong>
          <p {...stylex.props(ui.hint)}>
            Includes Skills added to your common directories in the future.
          </p>
        </div>
        <Switch.Root
          aria-label="Use all common Skills"
          checked={selected === undefined}
          disabled={disabled || !skills.data}
          onCheckedChange={(checked) => {
            if (checked) {
              const next = { ...document };
              delete next.allowed_skills;
              onChange(next);
            } else {
              update(all.map((item) => item.name));
            }
          }}
        >
          <Switch.Thumb />
        </Switch.Root>
      </div>
      <div {...stylex.props(ui.filters)}>
        <TextField.Root xstyle={ui.search}>
          <TextField.Control
            type="search"
            aria-label="Search Profile Skills"
            placeholder="Search Skills…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </TextField.Root>
      </div>
      <div {...stylex.props(ui.listToolbar)}>
        <span {...stylex.props(ui.hint)}>
          {all.filter((item) => enabled(item.name)).length} of {all.length}{" "}
          enabled{selected === undefined ? " · Includes future Skills" : ""}
        </span>
        <div {...stylex.props(ui.bulkActions)}>
          <Button
            size="compact"
            variant="ghost"
            disabled={disabled || !skills.data}
            onClick={() =>
              update([
                ...(selected ?? all.map((item) => item.name)),
                ...visible.map((item) => item.name),
              ])
            }
          >
            Enable {query ? "matching" : "all"}
          </Button>
          <Button
            size="compact"
            variant="ghost"
            disabled={disabled || !skills.data}
            onClick={() =>
              update(
                (selected ?? all.map((item) => item.name)).filter(
                  (name) => !visible.some((item) => item.name === name)
                )
              )
            }
          >
            Disable {query ? "matching" : "all"}
          </Button>
        </div>
      </div>
      {skills.isPending ? (
        <p {...stylex.props(ui.hint)}>Loading Skills…</p>
      ) : skills.error ? (
        <p role="alert" {...stylex.props(ui.hint)}>
          {skills.error.message}
        </p>
      ) : visible.length ? (
        <div {...stylex.props(s.list)}>
          {visible.map((item) => (
            <div {...stylex.props(s.row)} key={item.name}>
              <div {...stylex.props(s.text)}>
                <strong>{item.name}</strong>
                <span {...stylex.props(s.description)} title={item.description}>
                  {item.description || "No description"}
                </span>
                <small>{item.directory}</small>
              </div>
              <Switch.Root
                aria-label={`Skill ${item.name}`}
                checked={enabled(item.name)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const names = selected ?? all.map((skill) => skill.name);
                  update(
                    checked
                      ? [...names, item.name]
                      : names.filter((name) => name !== item.name)
                  );
                }}
              >
                <Switch.Thumb />
              </Switch.Root>
            </div>
          ))}
        </div>
      ) : (
        <p {...stylex.props(ui.hint)}>
          {query
            ? "No matching Skills."
            : "No Skills found in common directories."}
        </p>
      )}
    </section>
  );
}
const s = stylex.create({
  list: {
    maxHeight: "420px",
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    padding: "12px 20px",
    borderBottom: "1px solid var(--color-border-secondary)",
  },
  description: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  text: {
    display: "grid",
    gap: "4px",
    minWidth: 0,
    fontSize: "12px",
    color: "var(--color-content-secondary)",
    overflowWrap: "anywhere",
  },
});
