import { initializeLocalAdministration } from "./administration-host";
import { resolveHostConfiguration } from "./configuration";

if (process.argv.slice(2).join(" ") !== "--create-instance") {
  throw new Error(
    "Explicit local instance creation requires --create-instance. Existing memberships are never reset."
  );
}
const config = await resolveHostConfiguration(import.meta.dir);
if (!config.administration) {
  throw new Error(
    "Enable LENSO_TS_ADMINISTRATION before creating a local instance."
  );
}
const created = initializeLocalAdministration(config);
console.log(
  created
    ? "Created the isolated local Console instance with its configured first operator."
    : "The Console instance already exists; memberships and roles were not changed."
);
