import { describe, expect, test } from "vitest";

import type {
  ConfigDescriptorDto,
  ConfigGroupDto,
} from "../hooks/runtime-api-types";
import {
  type ConfigRow,
  filterVisibleConfigRows,
  filterConfigRows,
  groupConfigRows,
  sectionConfigRows,
} from "./config-page";

const groups: ConfigGroupDto[] = [
  {
    description: "Install and load modules.",
    id: "modules",
    label: "Modules",
    order: 10,
  },
  {
    description: "Password hashing policy.",
    id: "auth-password.hashing",
    label: "Password Hashing",
    order: 20,
  },
  {
    description: "Token issuance and JWT settings.",
    id: "auth-password.tokens",
    label: "Tokens",
    order: 30,
  },
];

describe("config page model", () => {
  test("groups rows as top-level accordions", () => {
    expect(
      groupConfigRows(filterVisibleConfigRows(rows), groups).map(
        (group) => group.label
      )
    ).toEqual(["Modules", "Password Hashing", "Tokens", "Identity"]);
  });

  test("filters rows by group label and key", () => {
    expect(
      filterConfigRows(rows, "password algorithm", groups).map(
        (row) => row.descriptor.key
      )
    ).toEqual(["hash_algorithm"]);
  });

  test("hides JWT settings until token strategy is jwt", () => {
    expect(
      filterVisibleConfigRows(rows).map((row) => row.descriptor.key)
    ).not.toContain("jwt_secret");
    expect(
      filterVisibleConfigRows(
        rows.map((item) =>
          item.descriptor.key === "token_strategy"
            ? { ...item, value: "jwt" }
            : item
        )
      ).map((row) => row.descriptor.key)
    ).toContain("jwt_secret");
  });

  test("renders sections inside a group", () => {
    const tokenRows = filterVisibleConfigRows(
      rows.map((item) =>
        item.descriptor.key === "token_strategy"
          ? { ...item, value: "jwt" }
          : item
      )
    ).filter((row) => row.descriptor.group === "auth-password.tokens");

    expect(
      sectionConfigRows(tokenRows).map((section) => section.label)
    ).toEqual(["Issuance", "JWT"]);
  });
});

const rows: ConfigRow[] = [
  row({
    group: "modules",
    key: "modules.identity.enabled",
    order: 10,
    service: "*",
  }),
  row({
    description: "Password hash algorithm.",
    group: "auth-password.hashing",
    key: "hash_algorithm",
    order: 10,
    service: "auth-password",
  }),
  row({
    group: "auth-password.tokens",
    key: "token_strategy",
    order: 10,
    section: "Issuance",
    service: "auth-password",
    value_type: { kind: "enum", values: ["session", "jwt"] },
  }),
  row({
    group: "auth-password.tokens",
    key: "jwt_secret",
    order: 20,
    section: "JWT",
    service: "auth-password",
    visible_when: {
      kind: "equals",
      key: "token_strategy",
      service: "auth-password",
      value: "jwt",
    },
  }),
  row({
    group: null,
    key: "profile_visibility",
    service: "identity",
  }),
];

function row(overrides: Partial<ConfigDescriptorDto>): ConfigRow {
  return {
    descriptor: {
      default: null,
      description: "",
      editable: true,
      group: null,
      key: "test",
      order: 0,
      restart_only: false,
      section: null,
      service: "test",
      value_type: { kind: "string" },
      visible_when: null,
      ...overrides,
    },
    pendingRestart: false,
    source: "default",
    value: null,
    valueType: { kind: "string" },
  };
}
