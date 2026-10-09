import path from "node:path";

import { migrateLocalLocaleStore } from "./migrations";

if (import.meta.main) {
  const args = process.argv.slice(2);
  const [databasePath] = args;
  if (args.length !== 1 || !databasePath) {
    throw new Error(
      "Usage: bun examples/ts-console/locale-store/migrate.ts <database-path> (explicit local/test database only)"
    );
  }
  await migrateLocalLocaleStore(path.resolve(databasePath));
  console.log("Local Console locale schema is current");
}
