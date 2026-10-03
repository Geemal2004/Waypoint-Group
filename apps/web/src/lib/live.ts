import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Account } from "./models";

// EventSource uses the same authenticated cookie as the authoritative API.
// No events or positions are put into the service-worker response cache.
export function useLiveUpdates(account: Account | null) {
  const client = useQueryClient();
  const [state, setState] = useState("Connecting");
  useEffect(() => {
    if (!account) return;
    let cursor = 0,
      networkRevision = 0,
      source: EventSource | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      closed = false;
    const connect = () => {
      if (closed || !navigator.onLine) {
        setState("Offline");
        return;
      }
      source?.close();
      clearTimeout(timer);
      source = new EventSource(`/api/v1/live/events?after=${cursor}`);
      source.onopen = () => setState("Live");
      source.addEventListener("operations", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          const next = Number(data.cursor);
          if (
            next !== cursor ||
            Number(data.networkRevision) !== networkRevision
          ) {
            networkRevision = Number(data.networkRevision);
            cursor = next;
            window.dispatchEvent(new Event("waypoint-operations"));
            void client.invalidateQueries({ queryKey: [account.id] });
            void client.invalidateQueries({ queryKey: ["network"] });
            void client.invalidateQueries({ queryKey: ["messages"] });
          }
          window.dispatchEvent(
            new CustomEvent("waypoint-locations", {
              detail: data.locations || [],
            }),
          );
          setState("Live");
        } catch {
          setState("Update unavailable");
        }
      });
      source.onerror = () => {
        source?.close();
        setState(navigator.onLine ? "Reconnecting" : "Offline");
        timer = setTimeout(connect, 3000);
      };
    };
    const offline = () => {
      source?.close();
      setState("Offline");
    };
    connect();
    window.addEventListener("online", connect);
    window.addEventListener("offline", offline);
    return () => {
      closed = true;
      source?.close();
      clearTimeout(timer);
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", offline);
    };
  }, [account?.id, client]);
  return state;
}
