/**
 * Event envelope for the Super Agent kernel.
 *
 * Invariant: an inbound event is addressed by its provider identity, never by
 * its payload. The payload lives in the spill store; the kernel only routes
 * `payloadRef` around. This keeps context windows small and makes replay cheap.
 */

export type EventSource = "github" | "sentry" | "linear" | "chat" | "cron";

export type EventKind =
  | "issue.created"
  | "issue.updated"
  | "pr.opened"
  | "pr.review_requested"
  | "pr.comment"
  | "ci.failed"
  | "incident.new"
  | "incident.regressed"
  | "chat.message"
  | "tick";

/** Fast-path verdict produced by the per-source policy before anything is routed. */
export type FilterVerdict = "ignore" | "explicit_only" | "candidate";

export interface EventEnvelope {
  /** Kernel-assigned id, uuid v7 so it sorts by arrival time. */
  id: string;
  source: EventSource;
  kind: EventKind;
  /** Provider-side identity: issue key, PR number, sentry event id, message id. */
  externalId: string;
  /** Coalescing key: same PR / incident / chat topic share one thread. */
  threadId: string;
  /** Pointer into the spill store, e.g. "spill://01J8...". Never inline payloads. */
  payloadRef: string;
  /** ISO-8601, kernel clock. */
  receivedAt: string;
  /** Dedupe key. Two envelopes with the same key are the same event. */
  dedupeKey: string;
}

/**
 * The only dedupe identity the kernel accepts. Provider retries, webhook
 * replays and our own re-delivery all collapse onto this key.
 */
export function dedupeKeyFor(source: EventSource, externalId: string): string {
  return `${source}:${externalId}`;
}

export function makeEnvelope(input: {
  id: string;
  source: EventSource;
  kind: EventKind;
  externalId: string;
  threadId: string;
  payloadRef: string;
  receivedAt: string;
}): EventEnvelope {
  return {
    ...input,
    dedupeKey: dedupeKeyFor(input.source, input.externalId),
  };
}

/** A batch is what the slow path hands to the router in a single turn. */
export interface TriggerBatch {
  batchId: string;
  createdAt: string;
  /** Pointer-only items: id, thread, and the inline summary. */
  items: Array<{
    eventId: string;
    threadId: string;
    summary: string;
    /** Adjacent object ids the router may recall if it needs more. */
    adjacent: string[];
  }>;
  /** Pass-through events observed since the router last woke, one line each. */
  shadowLog: string[];
}
