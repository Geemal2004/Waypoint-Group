import { useState } from "react";
import type { Order, Conflict } from "../lib/models";
import { Button } from "./ui/button";
import { OrderChooser, Panel, Timeline } from "./operations";
export function OperationsHistory({
  orders,
  conflicts,
  action,
  busy,
}: {
  orders: Order[];
  conflicts: Conflict[];
  action: (path: string, body: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState(""),
    [showResolved, setShowResolved] = useState(false);
  const order = orders.find((o) => o.id === selected);
  return (
    <>
      <div className="page-heading design-heading">
        <p className="eyebrow">Operations / retained history</p>
        <h1>Review handoffs and retained proof</h1>
        <p>
          Order revisions, shortage decisions and offline evidence remain
          attached to the same delivery identifiers.
        </p>
      </div>
      <div className="order-desk">
        <Panel>
          <label>
            Search history
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order reference, date or outlet"
            />
          </label>
          <OrderChooser
            orders={orders.filter((o) =>
              `${o.source_ref} ${o.reference} ${o.outlet_name} ${o.day}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )}
            selected={selected}
            onSelect={setSelected}
          />
        </Panel>
        <div>
          {order ? (
            <>
              <Timeline order={order} />
              <details>
                <summary>Shared identifiers</summary>
                <p>
                  Order {order.id} · trip{" "}
                  {order.run?.route_trip_id || "unallocated"} · plan{" "}
                  {order.run?.plan_id || "unallocated"} v
                  {order.run?.plan_version || 0}
                </p>
              </details>
            </>
          ) : (
            <Panel>Select an order to inspect its retained history.</Panel>
          )}
          <Panel>
            <h2>Conflict review</h2>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />{" "}
              Show resolved decisions
            </label>
            {!conflicts.some((c) => showResolved || c.state === "OPEN") && (
              <p>No open delivery conflicts.</p>
            )}
            {conflicts
              .filter((c) => showResolved || c.state === "OPEN")
              .map((c) => {
                const o = orders.find((o) => o.id === c.order_id);
                return (
                  <article className="conflict-row" key={c.id}>
                    <strong>
                      {o?.source_ref || o?.reference || "Retained delivery"} ·{" "}
                      {c.state.toLowerCase()}
                    </strong>
                    <p>Local proof and server decision are retained.</p>
                    <a
                      href={`/api/v1/sync-conflicts/${c.id}/evidence`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View retained evidence
                    </a>
                    {c.state === "OPEN" && (
                      <>
                        <label>
                          Resolution reason
                          <textarea
                            value={reason}
                            maxLength={500}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <Button
                          disabled={busy || !reason.trim() || !navigator.onLine}
                          onClick={() =>
                            action(`/sync-conflicts/${c.id}/resolve`, {
                              expectedVersion: c.current_version,
                              acceptDelivery: true,
                              reason,
                            })
                          }
                        >
                          Accept verified delivery
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || !reason.trim() || !navigator.onLine}
                          onClick={() =>
                            action(`/sync-conflicts/${c.id}/resolve`, {
                              expectedVersion: c.current_version,
                              acceptDelivery: false,
                              reason,
                            })
                          }
                        >
                          Keep server decision
                        </Button>
                      </>
                    )}
                  </article>
                );
              })}
          </Panel>
        </div>
      </div>
    </>
  );
}
