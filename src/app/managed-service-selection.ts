import { useSyncExternalStore } from "react";

export const managedServiceSelectionStorageKey =
  "lenso-console:selected-managed-service";
const changeEvent = "lenso-console-managed-service-change";
const listeners = new Set<() => void>();

export function getSelectedManagedServiceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(managedServiceSelectionStorageKey);
}

export function selectManagedService(serviceId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(managedServiceSelectionStorageKey, serviceId);
  window.dispatchEvent(new Event(changeEvent));
}

export function clearManagedServiceSelection(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(managedServiceSelectionStorageKey);
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeManagedServiceSelection(
  listener: () => void
): () => void {
  listeners.add(listener);
  if (typeof window === "undefined") {
    return () => listeners.delete(listener);
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === managedServiceSelectionStorageKey) {
      listener();
    }
  };
  const onChange = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, onChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, onChange);
  };
}

export function useSelectedManagedServiceId(): string | null {
  return useSyncExternalStore(
    subscribeManagedServiceSelection,
    getSelectedManagedServiceId,
    () => null
  );
}
