import fs from "node:fs";
import path from "node:path";

const validateFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      validateFiles(file);
    } else if (!entry.isFile()) {
      throw new Error(`Shell assets must be regular files: ${file}`);
    }
  }
};

// Package the owner-built Shell beside the compiler, never rebuild it in Apps.
export const validateShell = (root) => {
  const index = path.join(root, "index.html");
  if (!fs.statSync(index).isFile()) {
    throw new Error("Shell index.html is missing");
  }
  const html = fs.readFileSync(index, "utf-8");
  for (const match of html.matchAll(/\s(?:src|href)=["']([^"']+)["']/gu)) {
    const [reference] = match[1].split(/[?#]/u);
    if (!reference || /^(?:[a-z]+:|\/\/)/iu.test(reference)) {
      continue;
    }
    const asset = path.resolve(root, reference.replace(/^\//u, ""));
    if (!asset.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new Error(`Shell reference escapes asset root: ${reference}`);
    }
    if (!fs.statSync(asset).isFile()) {
      throw new Error(`Shell asset missing: ${reference}`);
    }
  }
  validateFiles(root);
};

export const prepareShell = (source, destination) => {
  validateShell(source);
  fs.rmSync(destination, { force: true, recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  validateShell(destination);
};

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const repo = path.resolve(import.meta.dirname, "../..");
  prepareShell(
    path.join(repo, "apps/shell/dist/client"),
    path.join(repo, "packages/console-authoring/shell")
  );
}
