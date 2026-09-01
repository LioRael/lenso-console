import * as stylex from "@stylexjs/stylex";

export const agentMessageControlStyles = stylex.create({
  action: {
    borderRadius: "var(--radius-rounded)",
    color: "lch(66 1 282)",
    height: "24px",
    minWidth: "24px",
    padding: "0 2px",
    width: "24px",
  },
  actions: {
    display: "flex",
    gap: "2px",
    height: "24px",
  },
  cancel: {
    borderColor: "transparent",
    borderRadius: "var(--radius-rounded)",
    borderStyle: "solid",
    borderWidth: "0.5px",
    color: "lch(40 1 282)",
    height: "24px",
    marginInlineStart: "auto",
    minWidth: "24px",
    padding: "0 2px",
    width: "24px",
  },
  compactCancel: {
    height: "20px",
    marginInlineEnd: "8px",
    minWidth: "20px",
    width: "20px",
  },
  compactCancelIcon: {
    height: "8px",
    width: "8px",
  },
  editingBar: {
    alignItems: "center",
    color: "lch(40 1 282)",
    display: "flex",
    fontSize: "12px",
    fontWeight: 500,
    height: "26.5px",
    lineHeight: "14.5px",
    paddingBottom: "4px",
    width: "100%",
  },
  editingLabel: {
    alignItems: "center",
    display: "flex",
    gap: "6px",
    height: "22.5px",
    padding: "4px 4px 4px 8px",
  },
  icon: {
    height: "12px",
    width: "12px",
  },
});
