# Release Process

`LioRael/lenso-console` owns its Console application and OCI image. It
does not use a repository-wide release plan, shadow registry, central publisher,
release nonce, or cross-repository receipt channel.

## Versioning

Create a changeset for every user-facing Console change:

```sh
pnpm changeset
```

The Changesets workflow opens or updates a version pull request for the private
`@lenso/console-web` application. There is no Console-owned public npm package
or npm publication step. Historical package versions and tags remain historical
records; the application version now exists only to drive immutable OCI releases.

## Console OCI image

The root private package version is the Console release version. When a
merged Changesets version update changes that version, the repository-local OCI
workflow:

1. builds `linux/amd64` and `linux/arm64` concurrently on native GitHub-hosted
   runners, then combines their digests as
   `ghcr.io/liorael/lenso-console:VERSION`;
2. refuses to overwrite an existing version tag;
3. publishes the image with GitHub OIDC and build provenance;
4. creates the immutable `lenso-console@VERSION` GitHub release.

The image digest and build provenance are the installation source of truth.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm changeset status --output /tmp/lenso-console-changesets.json
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:browser
```
