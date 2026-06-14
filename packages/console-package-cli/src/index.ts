#!/usr/bin/env node
import { realpathSync } from "node:fs";

import { Command } from "commander";

import {
  applyConsolePackageInstallPlan,
  createConsolePackage,
} from "./console-package";
import { errorMessage, hasExitCode } from "./file-utils";
import { createModule } from "./linked-module";
import { addModuleCatalogEntry, addRemoteModule } from "./remote-module";
import type { CliOptions } from "./types";

const addSharedCreateOptions = (command: Command) =>
  command
    .option("--repo-root <path>", "Lenso host repository root")
    .option("--output-dir <path>", "directory for standalone remote packages")
    .option("--runtime-console-root <path>", "Runtime Console app root")
    .option("--area <name>", "console surface area")
    .option("--label <label>", "display label")
    .option("--route <route>", "console route")
    .option("--capability <capability>", "required capability")
    .option("--icon <icon>", "Lucide icon name")
    .option("--source <source>", "console package install source")
    .option("--remote", "create a standalone remote module package")
    .option("--with-console", "create a matching Runtime Console package")
    .option("--package-slug <slug>", "console package slug")
    .option("--package-scope <scope>", "console package npm scope")
    .option("--package-name <name>", "full console package name")
    .option("--surface-name <name>", "console surface name")
    .option("--package-root <name>", "remote package root directory")
    .option("--dry-run", "print files without writing them");

const addRemoteModuleOptions = (command: Command) =>
  command
    .option("--repo-root <path>", "Lenso host repository root")
    .option("--env-file <path>", "env file to update")
    .option("--install-plan-file <path>", "console package install plan file")
    .option("--base-url <url>", "remote module base URL")
    .option("--dry-run", "print install changes without writing them");

const addModuleCatalogOptions = (command: Command) =>
  command
    .option("--repo-root <path>", "Lenso host repository root")
    .option("--catalog-file <path>", "module catalog file to update")
    .option("--base-url <url>", "remote module base URL")
    .option("--summary <text>", "catalog summary text")
    .option("--dry-run", "print catalog changes without writing them");

const addApplyPlanOptions = (command: Command) =>
  command
    .option("--repo-root <path>", "Lenso host repository root")
    .option("--runtime-console-root <path>", "Runtime Console app root")
    .option("--install-plan-file <path>", "console package install plan file")
    .option(
      "--dependency-version <version>",
      "dependency version to write when the package is not already declared"
    )
    .option("--dry-run", "print install plan changes without writing them");

const createProgram = ({
  defaultRuntimeConsoleRoot,
}: {
  defaultRuntimeConsoleRoot?: string;
} = {}) => {
  const program = new Command();
  program
    .name("lenso")
    .description("Lenso module and Runtime Console package tooling")
    .exitOverride()
    .showHelpAfterError();

  const moduleCommand = program
    .command("module")
    .description("create and manage Lenso modules")
    .addHelpText(
      "after",
      `
Remote module install:
  lenso module add <manifest-url>
  lenso module marketplace install <manifest-url>
  lenso console-package apply-plan
`
    );
  addSharedCreateOptions(
    moduleCommand
      .command("create <moduleId>")
      .description("create a linked or remote module scaffold")
  ).action(async (moduleId: string, options: CliOptions) => {
    await createModule({ options: { ...options, moduleId } });
  });
  addRemoteModuleOptions(
    moduleCommand
      .command("add <manifestReference>")
      .description("add a configured remote module source")
  ).action(async (manifestReference: string, options: CliOptions) => {
    await addRemoteModule({ manifestReference, options });
  });
  const catalogCommand = moduleCommand
    .command("catalog")
    .description("manage a local module catalog");
  addModuleCatalogOptions(
    catalogCommand
      .command("add <manifestReference>")
      .description("add a remote module manifest to the local catalog")
  ).action(async (manifestReference: string, options: CliOptions) => {
    await addModuleCatalogEntry({ manifestReference, options });
  });
  const marketplaceCommand = moduleCommand
    .command("marketplace")
    .description("install remote modules");
  addRemoteModuleOptions(
    marketplaceCommand
      .command("install <manifestReference>")
      .description("install a remote module from its manifest")
  ).action(async (manifestReference: string, options: CliOptions) => {
    await addRemoteModule({ manifestReference, options });
  });

  const consolePackageCommand = program
    .command("console-package")
    .description("create Runtime Console package scaffolds");
  addSharedCreateOptions(
    consolePackageCommand
      .command("create <moduleId>")
      .description("create a Runtime Console package scaffold")
  ).action(async (moduleId: string, options: CliOptions) => {
    await createConsolePackage({
      defaultRuntimeConsoleRoot,
      options: { ...options, moduleId },
    });
  });
  addApplyPlanOptions(
    consolePackageCommand
      .command("apply-plan")
      .description("apply a console package install plan")
  ).action(async (options: CliOptions) => {
    await applyConsolePackageInstallPlan({ options });
  });

  addSharedCreateOptions(
    program
      .command("create <moduleId>")
      .description("create a Runtime Console package scaffold")
  ).action(async (moduleId: string, options: CliOptions) => {
    await createConsolePackage({
      defaultRuntimeConsoleRoot,
      options: { ...options, moduleId },
    });
  });

  return program;
};

export const runConsolePackageCli = async (
  args: string[],
  {
    defaultRuntimeConsoleRoot,
  }: {
    defaultRuntimeConsoleRoot?: string;
  } = {}
): Promise<number> => {
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const program = createProgram(
    defaultRuntimeConsoleRoot === undefined ? {} : { defaultRuntimeConsoleRoot }
  );
  if (normalizedArgs.length === 0) {
    program.outputHelp();
    return 1;
  }

  try {
    await program.parseAsync(normalizedArgs, { from: "user" });
    return 0;
  } catch (error: unknown) {
    if (hasExitCode(error)) {
      return error.exitCode;
    }
    throw error;
  }
};

const isCliEntry = () =>
  process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename;

if (isCliEntry()) {
  try {
    const exitCode = await runConsolePackageCli(process.argv.slice(2));
    process.exit(exitCode);
  } catch (error: unknown) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}
