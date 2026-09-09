export type ScratchpadPayload = { text: string; revision: number; contextId?: string | null };
export type ScratchpadSavePayload = ScratchpadPayload;
export type ScratchpadSaveResult =
  | { kind: "saved"; revision: number }
  | { kind: "conflict" }
  | { kind: "queued" }
  | { kind: "failed" };
export type ScratchpadQueueState = "Saved" | "Saving" | "Failed" | "Offline/Queued";

type Save = (payload: ScratchpadPayload) => Promise<ScratchpadSaveResult>;
type Reload = () => Promise<{ revision: number }>;
type OnError = (message: string) => void;

/** Coalesces edits, serializes requests, and reconciles optimistic-lock conflicts. */
export function createScratchpadSaveQueue(save: Save, reload: Reload, onState: (state: ScratchpadQueueState) => void, onError?: OnError) {
  let pending: ScratchpadPayload | null = null;
  let running = false;
  let scheduled = false;
  let failed = false;
  let latestRevision: number | null = null;
  let waiters: Array<() => void> = [];
  const settle = () => {
    if (!running && !pending && !scheduled) {
      onState(failed ? "Failed" : "Saved");
      const done = waiters; waiters = []; done.forEach(resolve => resolve());
    }
  };
  const drain = async () => {
    scheduled = false;
    if (running || !pending) { settle(); return; }
    running = true; const payload = latestRevision !== null && pending.revision < latestRevision ? { ...pending, revision: latestRevision } : pending; pending = null; failed = false; onState("Saving");
    try {
      let result = await save(payload);
      if (result.kind === "conflict") { const latest = await reload(); latestRevision = latest.revision; result = await save({ ...payload, revision: latest.revision }); }
      if (result.kind === "saved") latestRevision = result.revision;
      if (result.kind === "queued") { failed = true; onState("Offline/Queued"); }
      if (result.kind === "failed") { failed = true; onState("Failed"); }
    } catch (cause) { failed = true; onError?.(cause instanceof Error ? cause.message : "Scratch Pad save failed."); onState("Failed"); }
    finally { running = false; if (pending) { scheduled = true; queueMicrotask(() => void drain()); } else settle(); }
  };
  return {
    enqueue(payload: ScratchpadPayload) { pending = payload; onState("Saving"); if (!scheduled && !running) { scheduled = true; queueMicrotask(() => void drain()); } },
    flush() { return new Promise<void>(resolve => { waiters.push(resolve); if (!running && !pending && !scheduled) settle(); else if (!running && !scheduled) { scheduled = true; queueMicrotask(() => void drain()); } }); },
  };
}
