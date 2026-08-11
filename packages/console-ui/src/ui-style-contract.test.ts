import * as stylex from "@stylexjs/stylex";
import { describe, expect, test } from "vitest";

import {
  controlStyles,
  dataStyles,
  layoutStyles,
  pageStyles,
  settingsStyles,
  tableStyles,
} from "./ui";

describe("public StyleX slots", () => {
  test("keeps ownership groups directly composable", () => {
    const result = stylex.props(
      pageStyles.page,
      controlStyles.button,
      dataStyles.dataGrid,
      layoutStyles.splitView,
      settingsStyles.settingsToggle,
      tableStyles.table
    );

    expect(result.className).toBeTruthy();
  });

  test("keeps operational inventory layout independent from host CSS", () => {
    const result = stylex.props(
      pageStyles.pageHeader,
      pageStyles.pageActions,
      pageStyles.pageFilters,
      layoutStyles.splitViewMain,
      dataStyles.paneHeader,
      dataStyles.dataGrid,
      dataStyles.tableHeader,
      dataStyles.dataRow,
      layoutStyles.tabsList
    );

    expect(result.className).toBeTruthy();
  });
});
