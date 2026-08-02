import { defineConsoleExtension } from "@lenso/console-package-api";

import { authConsoleManifest } from "./manifest";
import {
  AuthCredentialsPage,
  AuthGitHubPage,
  AuthGooglePage,
  AuthOidcPage,
  AuthOverviewPage,
  AuthProvidersPage,
  AuthSessionsPage,
  AuthUsersPage,
} from "./page";

export const authConsoleExtension = defineConsoleExtension({
  components: {
    credentials: AuthCredentialsPage,
    github: AuthGitHubPage,
    google: AuthGooglePage,
    oidc: AuthOidcPage,
    overview: AuthOverviewPage,
    providers: AuthProvidersPage,
    sessions: AuthSessionsPage,
    users: AuthUsersPage,
  },
  manifest: authConsoleManifest,
});

export const authConsoleModule = authConsoleExtension.module;

export { authConsoleManifest } from "./manifest";
export {
  AuthCredentialsPage,
  AuthGitHubPage,
  AuthGooglePage,
  AuthOidcPage,
  AuthOverviewPage,
  AuthProvidersPage,
  AuthSessionsPage,
  AuthUsersPage,
} from "./page";
export {
  authDeviceRows,
  authProviderById,
  authProviderRows,
  authSessionRows,
  authUserRows,
} from "./model";
