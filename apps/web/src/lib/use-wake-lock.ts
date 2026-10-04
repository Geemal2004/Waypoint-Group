import { useEffect } from "react";

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let closed = false;
    const acquire = async () => {
      if (
        document.visibilityState !== "visible" ||
        (sentinel && !sentinel.released)
      )
        return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (closed) void next.release();
        else sentinel = next;
      } catch {
        // Battery saver or a hidden tab can refuse the lock; the trip still works.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release();
    };
  }, [enabled]);
}
