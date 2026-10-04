import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { nextMotion } from "./driver-workspace";
import type { Account, Order } from "./models";

export type SharedPosition = {
  vehicleId: string;
  longitude: number;
  latitude: number;
  accuracy: number;
  capturedAt: string;
  receivedAt: string;
};

export type LocationSharing = {
  reporting: boolean;
  setReporting: (on: boolean) => void;
  status: string;
  setStatus: (status: string) => void;
  position: SharedPosition | null;
  moving: boolean | null;
};

export function useLocationSharing(
  account: Account,
  order: Order | undefined,
): LocationSharing {
  const client = useQueryClient();
  const [reporting, setReporting] = useState(false),
    [status, setStatus] = useState("Location reporting is off"),
    [position, setPosition] = useState<SharedPosition | null>(null),
    [moving, setMoving] = useState<boolean | null>(null);
  const motion = useRef<boolean | null>(null);
  const reportMotion = (next: boolean | null) => {
    motion.current = next;
    setMoving(next);
  };
  const orderId = order?.id,
    vehicleId = order?.run?.vehicle_id;
  useEffect(() => {
    if (!reporting || !orderId || !vehicleId) return;
    let watch: number | undefined,
      lastSent = 0,
      closed = false;
    const pendingKey = `waypoint-position:${account.id}`;
    const send = async () => {
      const raw = sessionStorage.getItem(pendingKey);
      if (!raw || !navigator.onLine) return;
      try {
        const p = JSON.parse(raw);
        if (Date.now() - Date.parse(p.capturedAt) > 900000) {
          sessionStorage.removeItem(pendingKey);
          setStatus("Expired position discarded; waiting for a fresh capture");
          return;
        }
        const accepted = await api<SharedPosition>("/location", p);
        if (sessionStorage.getItem(pendingKey) === raw)
          sessionStorage.removeItem(pendingKey);
        if (!closed) {
          setPosition((current) =>
            current?.capturedAt &&
            Date.parse(current.capturedAt) > Date.parse(accepted.capturedAt)
              ? current
              : accepted,
          );
          setStatus(
            accepted.accuracy > 100
              ? "Location accepted · poor accuracy; approximate position"
              : "Location accepted by the dispatcher",
          );
          void client.invalidateQueries({
            queryKey: [account.id, `/orders/${orderId}/journey`],
          });
        }
      } catch (e) {
        if (!closed)
          setStatus(`Position queued on this tab: ${(e as Error).message}`);
      }
    };
    if (!navigator.geolocation) {
      setStatus("This browser cannot report location");
      setReporting(false);
      return;
    }
    watch = navigator.geolocation.watchPosition(
      (p) => {
        const next = {
          orderId,
          vehicleId,
          longitude: p.coords.longitude,
          latitude: p.coords.latitude,
          accuracy: p.coords.accuracy,
          capturedAt: new Date(p.timestamp).toISOString(),
          simulated: false,
        };
        setPosition({ ...next, receivedAt: "" });
        reportMotion(nextMotion(motion.current, p.coords.speed));
        setStatus(
          !navigator.onLine
            ? "Position captured · queued on this tab while offline"
            : next.accuracy > 100
              ? "Poor accuracy; location is approximate"
              : "Position captured",
        );
        sessionStorage.setItem(pendingKey, JSON.stringify(next));
        if (Date.now() - lastSent > 10000) {
          lastSent = Date.now();
          void send();
        }
      },
      (e) => {
        setStatus(
          e.code === 1
            ? "Location permission denied. Enable permission to report."
            : e.code === 2
              ? "Location unavailable; last accepted position may become stale"
              : "Location capture timed out",
        );
        reportMotion(null);
        if (e.code === 1) setReporting(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    const timer = setInterval(send, 10000);
    window.addEventListener("online", send);
    return () => {
      closed = true;
      reportMotion(null);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      window.removeEventListener("online", send);
    };
  }, [reporting, orderId, vehicleId, account.id]);
  useEffect(() => {
    if (!order || !["IN_TRANSIT", "ARRIVED"].includes(order.status))
      setReporting(false);
  }, [order?.status, order?.id]);
  return { reporting, setReporting, status, setStatus, position, moving };
}
