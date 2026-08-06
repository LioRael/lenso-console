import { stylexClassName } from "@lenso/console-ui";
import { cn as joinClassNames } from "cnfast";
import type { ClassValue } from "cnfast";

/**
 * Joins project classes and compiles known utility tokens through StyleX.
 * Project-specific and third-party classes remain untouched.
 */
export function cn(...inputs: ClassValue[]): string {
  return stylexClassName(joinClassNames(...inputs)) ?? "";
}
