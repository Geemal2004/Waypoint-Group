import type { Order } from "./models";
import type { OutboxAction } from "./offline-db";

export const driverActive = (order: Order) =>
  ["RELEASED", "IN_TRANSIT", "ARRIVED"].includes(order.status);
export const driverTripKey = (order: Order) =>
  JSON.stringify([order.day, order.run?.route_trip_id || order.id]);

export function driverTrips(orders: Order[], day?: string) {
  const grouped = new Map<string, Order[]>();
  for (const order of orders) {
    if (!order.run || (day && order.day !== day)) continue;
    const key = driverTripKey(order);
    grouped.set(key, [...(grouped.get(key) || []), order]);
  }
  return [...grouped.entries()]
    .map(([key, stops]) => ({
      key,
      stops: stops.sort(
        (a, b) => (a.run?.stop_sequence || 1) - (b.run?.stop_sequence || 1),
      ),
    }))
    .sort(
      (a, b) =>
        a.stops[0].day.localeCompare(b.stops[0].day) ||
        (a.stops[0].run?.departure_at || "").localeCompare(
          b.stops[0].run?.departure_at || "",
        ) ||
        a.key.localeCompare(b.key),
    );
}

export type DriverStep =
  "no-trip" | "review-load" | "next-stop" | "arrived" | "saved" | "trip-done";

export function driverStep(
  order: Order | undefined,
  savedStop: boolean,
  hasTrip: boolean,
): DriverStep {
  if (savedStop) return "saved";
  if (!order) return hasTrip ? "trip-done" : "no-trip";
  if (order.status === "RELEASED") return "review-load";
  if (order.status === "ARRIVED") return "arrived";
  return "next-stop";
}

export const driverStepTitle: Record<DriverStep, string> = {
  "no-trip": "Today's trips",
  "review-load": "Review released load",
  "next-stop": "Drive to next stop",
  arrived: "Record delivery",
  saved: "Delivery saved",
  "trip-done": "Trip stops finished",
};

/** GPS speed in m/s; hysteresis stops brief jitter from toggling the guard. */
export function nextMotion(
  previous: boolean | null,
  speed: number | null | undefined,
): boolean | null {
  if (speed == null || Number.isNaN(speed)) return previous;
  if (speed > 2.2) return true;
  if (speed < 0.8) return false;
  return previous;
}

export function driverSyncSummary(actions: OutboxAction[]) {
  const review = new Set(
    actions
      .filter((a) => ["conflict", "rejected"].includes(a.syncState))
      .map((a) => a.entityId),
  );
  const waiting = new Set(
    actions
      .filter((a) => ["pending", "syncing"].includes(a.syncState))
      .map((a) => a.entityId),
  );
  return { review: review.size, waiting: waiting.size };
}
