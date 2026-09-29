# Switch a legacy local Console to operators access

The migration imports deployment qualification. Auth still owns accounts and
credentials, Access Control still owns current permissions, and the selected
Management service applies both gates. Importing a subject never grants a token,
RBAC permission, or trust in the old App login issuer.

1. Export the deliberately reviewed `administrator_subjects` values to a JSON
   string array. Map each entry to its actual account subject in the independently
   configured operators realm. Omit unrecognized accounts; matching display names
   do not establish identity. Keep the selected deployment explicit.
2. Use an existing prepared qualification database, or initialize a new database
   once with the owner operator. Preview and review the exact plan before applying:

   ```sh
   cargo run --locked --manifest-path plugins/management/Cargo.toml \
     -p lenso-management-authority --bin management-operator -- \
     initialize /private/operator/qualification.sqlite
   cargo run --locked --manifest-path plugins/management/Cargo.toml \
     -p lenso-management-authority --bin management-operator -- \
     preview /private/operator/qualification.sqlite production \
     /private/operator/reviewed-subjects.json /private/operator/import-plan.json
   ```

   The plan identifies existing and new qualifications, the current deployment
   membership digest, and the requested import digest. Initialization is only for
   a new store; do not initialize an existing runtime database. Apply the reviewed
   digest as a literal argument:

   ```sh
   cargo run --locked --manifest-path plugins/management/Cargo.toml \
     -p lenso-management-authority --bin management-operator -- \
     apply /private/operator/qualification.sqlite \
     /private/operator/import-plan.json REVIEWED_DIGEST
   ```

   Changed membership or edited plan fields reject the import. Obtain a fresh
   preview after either change. Import preserves every other deployment.
3. Configure the scoped roles through the Access Control owner's authorized
   operations. Bind current Credential State, Access Control, Approval, and Audit
   ports to the selected authority. Keep the operators issuer/key and deployment
   explicit. The reference App's explicit setup uses these owner operations;
   qualification imports do not create those facts.
4. Prepare the next Host generation with `require_user_session: true`, an empty
   `administrator_subjects`, and `operators_profile` containing the deployment,
   independent issuer, public key, and assertion TTL. Remove legacy shared
   `console_agent_url`, `connected_agent_url`, `managed_apps`, and local Projects
   process configuration. Select only the intended guarded Management bindings.
   Configuration admission rejects a mixed operators/legacy shared-control
   profile. Enable `human_interface` only with the selected human guard and token
   lifecycle ports.
5. Activate through the existing Host generation/configuration path, or stop and
   restart the selected Host. Reauthenticate through the operators login. The old
   App session does not acquire access during this switch. Check the allowed
   catalog, a denied operation, and blocked legacy control/proxy routes before
   opening a remote listener.

To roll back, close the management entry or restore the explicitly local legacy
profile. Preserve Auth accounts, owner permissions, qualification, and business
state. Removing a required security provider must reject the candidate profile
or close its entry; it must not enable anonymous writes.
