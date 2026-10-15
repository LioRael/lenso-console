import { expect, test } from "bun:test";

import {
  chooseTableContext,
  type TableCandidate,
} from "../src/console-table-model";

const options = {
  blocked: false,
  focused: null,
  explicit: null,
  enter: 0.55,
  exit: 0.35,
};
const page: TableCandidate = {
  id: "page",
  mode: "page",
  coverage: 1,
  locked: false,
};
const embedded: TableCandidate = {
  id: "payments",
  mode: "embedded",
  coverage: 0.6,
  locked: false,
};

test("embedded tables need sustained viewport eligibility and retain an incumbent through the exit band", () => {
  expect(chooseTableContext([page, embedded], "page", options)).toBe(
    "payments"
  );
  expect(
    chooseTableContext([page, { ...embedded, coverage: 0.4 }], "page", options)
  ).toBe("page");
  expect(
    chooseTableContext(
      [page, { ...embedded, coverage: 0.4 }],
      "payments",
      options
    )
  ).toBe("payments");
  expect(
    chooseTableContext(
      [page, { ...embedded, coverage: 0.3 }],
      "payments",
      options
    )
  ).toBe("page");
});

test("focus and explicit choice outrank visibility, but never a live interaction lock", () => {
  const candidates = [page, embedded];
  expect(
    chooseTableContext([embedded], null, { ...options, pageFocused: true })
  ).toBeNull();
  expect(
    chooseTableContext(candidates, "payments", {
      ...options,
      pageFocused: true,
    })
  ).toBe("page");
  expect(
    chooseTableContext(candidates, "page", { ...options, focused: "page" })
  ).toBe("page");
  expect(
    chooseTableContext(candidates, "page", {
      ...options,
      explicit: "page",
      focused: "payments",
    })
  ).toBe("page");
  expect(
    chooseTableContext(candidates, "page", { ...options, blocked: true })
  ).toBe("page");
  expect(
    chooseTableContext([{ ...page, locked: true }, embedded], "page", options)
  ).toBe("page");
});

test("retiring an owner cannot pin a missing scope or clear its successor", () => {
  expect(
    chooseTableContext([page, embedded], "page", {
      ...options,
      explicit: "retired",
      focused: "page",
    })
  ).toBe("page");
  expect(
    chooseTableContext([page], "payments", {
      ...options,
      explicit: "payments",
      blocked: true,
    })
  ).toBe("page");
  expect(chooseTableContext([], "page", options)).toBeNull();
});
