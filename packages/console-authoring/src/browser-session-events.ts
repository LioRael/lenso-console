const invalidationKey = "lenso-console-session-invalidation";

export function broadcastConsoleSessionChange() {
  window.dispatchEvent(new Event("lenso-session-expired"));
  try {
    // An opaque nonce is an invalidation hint, never an identity or credential.
    localStorage.setItem(invalidationKey, crypto.randomUUID());
  } catch {
    // Storage may be disabled. Local retirement still takes effect.
  }
}

export function onConsoleSessionChange(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === invalidationKey) {
      listener();
    }
  };
  window.addEventListener("storage", storage);
  return () => window.removeEventListener("storage", storage);
}
