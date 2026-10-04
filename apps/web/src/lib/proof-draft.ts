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
  const writes = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    void offlineDb.proofDrafts
      .get(initial.key)
      .then((kept) => {
        if (!mounted.current || activeAccountId() !== accountId) return;
        if (kept?.accountId === accountId && kept.orderId === order.id) {
          current.current = kept;
          setDraft(kept);
          setState("saved");
        } else setState("ready");
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
  function update(
    patch: Partial<
      Pick<ProofDraft, "quantities" | "issue" | "photo" | "photoName">
    >,
  ) {
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
    current.current = initial;
    setDraft(initial);
    setState("ready");
    setError("");
  }
  return {
    draft,
    state,
    error,
    update,
    discard,
    flush: () => writes.current,
    stale: draft.expectedVersion !== order.version,
  };
}
