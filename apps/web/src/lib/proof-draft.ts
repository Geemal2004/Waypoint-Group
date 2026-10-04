import { useEffect, useRef, useState } from "react";
import { offlineDb, type ProofDraft } from "./offline-db";
import { activeAccountId } from "./sync";
import type { Order } from "./models";

export const proofDraftKey = (accountId: string, orderId: string) =>
  JSON.stringify([accountId, orderId]);

// A draft never enters the outbox until the driver explicitly saves proof.
export function useProofDraft(accountId: string, order: Order) {
  const initial: ProofDraft = {
    key: proofDraftKey(accountId, order.id),
    accountId,
    orderId: order.id,
    expectedVersion: order.version,
    quantities: Object.fromEntries(
      order.lines.map((l) => [l.id, l.loaded ?? 0]),
    ),
    issue: "",
    updatedAt: new Date().toISOString(),
  };
  const [draft, setDraft] = useState(initial);
  const [state, setState] = useState<
    "loading" | "saving" | "saved" | "error" | "ready"
  >("loading");
  const [error, setError] = useState("");
  const current = useRef(initial);
  const latestInitial = useRef(initial);
  latestInitial.current = initial;
  const prepared = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    void offlineDb.proofDrafts
      .get(initial.key)
      .then((kept) => {
        if (!mounted.current) return;
        if (activeAccountId() !== accountId) {
          setState("error");
          setError(
            "Account changed. Reopen this workspace with the same driver. Your local evidence is retained.",
          );
          return;
        }
        if (kept?.accountId === accountId && kept.orderId === order.id) {
          prepared.current = true;
          current.current = kept;
          setDraft(kept);
          setState("saved");
        } else {
          current.current = latestInitial.current;
          setDraft(latestInitial.current);
          setState("ready");
        }
      })
      .catch(() => {
        if (mounted.current) {
          setState("error");
          setError(
            "Cannot open local drafts. Your submitted proof remains separate. Check device storage and retry.",
          );
        }
      });
    return () => {
      mounted.current = false;
    };
  }, [accountId, order.id]);
  useEffect(() => {
    // Only untouched forms follow polling updates. Prepared evidence keeps its
    // original version until the driver explicitly reviews or discards it.
    if (state === "ready" && !prepared.current) {
      current.current = latestInitial.current;
      setDraft(latestInitial.current);
    }
  }, [order.version, state]);
  function update(
    patch: Partial<
      Pick<ProofDraft, "quantities" | "issue" | "photo" | "photoName">
    >,
  ) {
    prepared.current = true;
    const next = {
      ...current.current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    current.current = next;
    setDraft(next);
    setState("saving");
    setError("");
    const writeRevision = ++revision.current;
    // Serialize snapshots so rapid changes cannot overwrite a newer draft.
    const write = writes.current
      .catch(() => {})
      .then(async () => {
        if (activeAccountId() !== accountId)
          throw new Error(
            "Account changed. Sign in with the same driver to continue.",
          );
        await offlineDb.proofDrafts.put(next);
      });
    writes.current = write;
    void write
      .then(() => {
        if (mounted.current && revision.current === writeRevision)
          setState("saved");
      })
      .catch((e: Error) => {
        if (mounted.current && revision.current === writeRevision) {
          setState("error");
          setError(
            e.message ||
              "Cannot save the draft. Check available device storage.",
          );
        }
      });
  }
  async function discard() {
    await writes.current.catch(() => {});
    if (activeAccountId() !== accountId)
      throw new Error("Account changed. Reopen this workspace.");
    await offlineDb.proofDrafts.delete(initial.key);
    prepared.current = false;
    current.current = latestInitial.current;
    setDraft(latestInitial.current);
    setState("ready");
    setError("");
  }
  function review() {
    if (activeAccountId() !== accountId)
      throw new Error("Account changed. Reopen this workspace.");
    const quantities = current.current.quantities;
    if (
      Object.keys(quantities).length !== order.lines.length ||
      order.lines.some(
        (line) =>
          !Number.isInteger(quantities[line.id]) ||
          quantities[line.id] < 0 ||
          quantities[line.id] > (line.loaded ?? 0),
      )
    )
      throw new Error(
        "The retained quantities do not match the current released load. Keep the evidence and ask dispatch to review this stop.",
      );
    // The driver explicitly reviewed the displayed load; keep original evidence.
    current.current = { ...current.current, expectedVersion: order.version };
    update({});
  }
  return {
    draft,
    state,
    error,
    update,
    discard,
    review,
    flush: () => writes.current,
    stale: draft.expectedVersion !== order.version,
  };
}
