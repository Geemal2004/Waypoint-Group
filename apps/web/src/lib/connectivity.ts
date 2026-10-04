import { useSyncExternalStore } from "react";

let reachable = false;
const listeners = new Set<() => void>();
export function reportServiceConnection(connected: boolean) {
  reachable = connected && navigator.onLine;
  listeners.forEach((listener) => listener());
}
window.addEventListener("offline", () => reportServiceConnection(false));
// A restored network still needs a successful API response before going online.
window.addEventListener("online", () => reportServiceConnection(false));
export function useServiceOnline() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => reachable,
  );
}

export async function serviceFetch(url: string, options: RequestInit) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
    reportServiceConnection(response.status < 500);
    return response;
  } catch (error) {
    reportServiceConnection(false);
    throw error;
  }
}
