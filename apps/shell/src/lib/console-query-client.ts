import { QueryClient } from "@tanstack/react-query";

/** Authentication lifecycle on the existing cache, not another cache store. */
export class ConsoleQueryClient extends QueryClient {
  permissionEpoch = 0;
  authenticationScope: string | undefined;

  override clear() {
    this.permissionEpoch += 1;
    void this.cancelQueries();
    super.clear();
  }

  /** Opaque public digest supplied only by the admitted Console session endpoint. */
  admitReadScope(scope: string | null) {
    const next =
      scope && /^(?:local|[a-f0-9]{64})$/u.test(scope) ? scope : undefined;
    if (next !== this.authenticationScope) {
      this.clear();
      this.authenticationScope = next;
    }
  }
}
