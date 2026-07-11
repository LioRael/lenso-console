/**
 * Runtime Console packages remain independently versioned. Dependency propagation
 * is derived from package manifests; no grouped Version PRs are enabled.
 */
export default {
  ignore: [
    "@lenso/identity-console",
    "@lenso/remote-crm-console",
    "@lenso/story-console",
  ],
  npm: {
    // A dependency edge orders publication; it does not force an unrelated SDK bump.
    bumpDep: () => false,
  },
  packages: {
    "@lenso/remote-module-kit": {},
    "@lenso/runtime-console-api": {},
    "@lenso/service-kit": {},
  },
};
