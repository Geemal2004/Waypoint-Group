import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button } from "./ui/button";
type RecordRow = Record<string, string | number | boolean | null>;
const fields: Record<string, string[]> = {
  waypoints: ["longitude", "latitude", "provenance", "supplemental"],
  outlets: [
    "name",
    "brand_code",
    "depot_code",
    "district",
    "access",
    "window_start",
    "window_end",
    "dock_type",
    "mall_window",
    "record_provenance",
  ],
  products: [
    "name",
    "brand_code",
    "unit",
    "weight_kg",
    "volume_m3",
    "temperature",
    "min_c",
    "max_c",
    "handling",
    "catalog_enabled",
    "provenance",
  ],
  vehicles: [
    "name",
    "depot_code",
    "kind",
    "refrigerated",
    "min_c",
    "max_c",
    "weight_kg",
    "volume_m3",
    "weekly_fuel_l",
    "km_per_l",
    "driver_id",
    "available",
    "cold_capability_source",
    "record_provenance",
  ],
  depots: ["name", "record_provenance"],
  accounts: [
    "username",
    "display_name",
    "role",
    "depot_code",
    "enabled",
    "phone",
  ],
};
const choices: Record<string, string[]> = {
  brand_code: ["FRESH", "STYLE", "TECH"],
  access: ["ANY", "VAN_ONLY"],
  dock_type: ["rear_dock", "street", "mall_bay"],
  kind: ["VAN", "TRUCK"],
  temperature: ["AMBIENT", "CHILLED", "FROZEN"],
  role: ["MANAGER", "DISPATCHER", "LOADER", "DRIVER"],
};
const booleans = [
  "supplemental",
  "mall_window",
  "catalog_enabled",
  "refrigerated",
  "available",
  "enabled",
];
const numbers = [
  "longitude",
  "latitude",
  "weight_kg",
  "volume_m3",
  "min_c",
  "max_c",
  "weekly_fuel_l",
  "km_per_l",
];
export function Administration() {
  const q = useQuery({
    queryKey: ["administration"],
    queryFn: () => api<Record<string, RecordRow[]>>("/administration"),
  });
  const [type, setType] = useState("outlets"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<RecordRow | null>(null),
    [values, setValues] = useState<RecordRow>({}),
    [id, setId] = useState(""),
    [reason, setReason] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [importData, setImportData] = useState<unknown>(null),
    [report, setReport] = useState<{
      valid: boolean;
      records: number;
      errors: { row: number; message: string }[];
    } | null>(null),
    [calendarDay, setCalendarDay] = useState(""),
    [manager, setManager] = useState(""),
    [outlet, setOutlet] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  if (q.error)
    return (
      <section className="panel">
        <h1>Operational administration</h1>
        <p role="alert">{(q.error as Error).message}</p>
        <p>Ask an authorized administrator to provision operational access.</p>
      </section>
    );
  if (!q.data) return <p>Loading administration…</p>;
  return (
    <>
      <div className="page-heading design-heading">
        <p className="eyebrow">Operations / administration</p>
        <h1>Maintain the operational network</h1>
        <p>
          Every accepted change records its author and reason. Active plan
          constraints require the assigned work to finish or be deferred first.
        </p>
      </div>
      {error && (
        <p className="notice critical" role="alert">
          {error}
        </p>
      )}
      <div className="tabs">
        {Object.keys(fields).map((t) => (
          <Button
            key={t}
            variant={type === t ? "default" : "outline"}
            onClick={() => {
              setType(t);
              setSelected(null);
              setId("");
              setValues({});
              setReport(null);
              setImportData(null);
            }}
          >
            {t}
          </Button>
        ))}
      </div>
      <div className="order-desk">
        <section className="panel">
          <label>
            Find record
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Reference or name"
            />
          </label>
          <Button
            variant="outline"
            onClick={() => {
              setSelected(null);
              setValues(
                Object.fromEntries(
                  fields[type].map((f) => [
                    f,
                    booleans.includes(f) ? false : choices[f]?.[0] || "",
                  ]),
                ),
              );
              setId("");
              setReason("");
            }}
          >
            Create {type.replace(/s$/, "")}
          </Button>
          <div className="admin-records">
            {q.data[type]
              .filter((r) =>
                JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
              )
              .map((r) => (
                <button
                  className="fleet-row"
                  key={String(r.id || r.code || r.point_id)}
                  onClick={() => {
                    setSelected(r);
                    setId(String(r.id || r.code || r.point_id));
                    setValues(r);
                    setReason("");
                    setPassword("");
                  }}
                >
                  <strong>{r.id || r.code || r.point_id}</strong>
                  <span>
                    {r.name || r.display_name || r.provenance} · revision{" "}
                    {r.revision}
                  </span>
                </button>
              ))}
          </div>
        </section>
        <form
          className="panel admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api(`/administration/${type}`, {
                id,
                expectedRevision: selected?.revision || 0,
                fields: Object.fromEntries(
                  fields[type].map((f) => [
                    f,
                    values[f] === "" && ["min_c", "max_c", "phone"].includes(f)
                      ? null
                      : values[f],
                  ]),
                ),
                reason,
                initialPassword: password || null,
              });
              setPassword("");
              setSelected(null);
              setId("");
              setValues({});
            });
          }}
        >
          <h2>
            {selected ? "Edit operational record" : "Create a reviewed record"}
          </h2>
          <label>
            Reference
            <input
              required
              disabled={!!selected}
              value={id}
              onChange={(e) => setId(e.target.value)}
              maxLength={32}
            />
          </label>
          {fields[type].map((f) => (
            <label key={f}>
              {f.replaceAll("_", " ")}
              {booleans.includes(f) ? (
                <select
                  value={String(values[f] || false)}
                  onChange={(e) =>
                    setValues({ ...values, [f]: e.target.value === "true" })
                  }
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              ) : choices[f] ? (
                <select
                  value={String(values[f] || "")}
                  onChange={(e) =>
                    setValues({ ...values, [f]: e.target.value })
                  }
                >
                  <option value="">Choose</option>
                  {choices[f].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    numbers.includes(f)
                      ? "number"
                      : f.startsWith("window_")
                        ? "time"
                        : "text"
                  }
                  step={numbers.includes(f) ? "any" : undefined}
                  value={String(values[f] ?? "")}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f]:
                        numbers.includes(f) && e.target.value !== ""
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              )}
            </label>
          ))}
          {type === "accounts" && !selected && (
            <label>
              Initial password
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Review reason
            <textarea
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            disabled={saving || !navigator.onLine || !id || !reason.trim()}
          >
            Save reviewed change
          </Button>
        </form>
      </div>
      <section className="panel">
        <h2>Validate an import before applying it</h2>
        <p>
          Upload a JSON file containing a records array. Each record needs id,
          expectedRevision, fields and reason using the field names above.
          Maximum 200 records. Dependent references must already exist. Preview
          runs the same validation and rolls back every trial row; any invalid
          row rejects the entire import.
        </p>
        <label>
          Reviewed {type} import
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              setReport(null);
              setImportData(null);
              try {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2_000_000)
                  throw new Error("Import must be under 2 MB.");
                const data = JSON.parse(await file.text());
                setImportData(data);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
        <Button
          variant="outline"
          disabled={!importData || saving || !navigator.onLine}
          onClick={() =>
            run(async () =>
              setReport(
                await api(`/administration/${type}/preview`, importData),
              ),
            )
          }
        >
          Validate import
        </Button>
        {report && (
          <>
            <p className={"notice " + (report.valid ? "success" : "critical")}>
              {report.valid
                ? `${report.records} records passed preview. Review before applying.`
                : "Import rejected; no records changed."}
            </p>
            {report.errors.map((e) => (
              <p key={e.row}>
                Row {e.row}: {e.message}
              </p>
            ))}
            <Button
              disabled={!report.valid || saving || !navigator.onLine}
              onClick={() =>
                run(async () => {
                  await api(`/administration/${type}/import`, importData);
                  setReport(null);
                  setImportData(null);
                })
              }
            >
              Apply reviewed import
            </Button>
          </>
        )}
      </section>
      <section className="panel">
        <h2>Operating days and store access</h2>
        <label>
          Operating day
          <input
            type="date"
            value={calendarDay}
            onChange={(e) => setCalendarDay(e.target.value)}
          />
        </label>
        <label>
          Authorization reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </label>
        <Button
          disabled={!calendarDay || !reason || saving}
          onClick={() =>
            run(() =>
              api("/administration/calendar", { day: calendarDay, reason }),
            )
          }
        >
          Review operating day
        </Button>
        <label>
          Store account
          <select value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">Choose an enabled manager</option>
            {q.data.accounts
              .filter((a) => a.role === "MANAGER" && a.enabled)
              .map((a) => (
                <option key={String(a.id)} value={String(a.id)}>
                  {a.display_name} · {a.depot_code}
                </option>
              ))}
          </select>
        </label>
        <label>
          Outlet
          <select value={outlet} onChange={(e) => setOutlet(e.target.value)}>
            <option value="">Choose outlet</option>
            {q.data.outlets.map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {o.name} · {o.depot_code}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!manager || !outlet || !reason || saving}
          onClick={() =>
            run(() =>
              api("/administration/scope", {
                managerId: manager,
                outletId: outlet,
                reason,
              }),
            )
          }
        >
          Grant reviewed outlet access
        </Button>
      </section>
      <section className="panel">
        <h2>Operational change history</h2>
        {q.data.audit.map((a) => (
          <article key={String(a.id)}>
            <strong>
              {a.event} · {a.entity_id}
            </strong>
            <p>{a.reason}</p>
            <small>
              {a.actor} · {String(a.accepted_at)}
            </small>
          </article>
        ))}
      </section>
    </>
  );
}
