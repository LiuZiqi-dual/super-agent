/**
 * Deterministic idempotency keys for externally visible effects.
 *
 * The trap this closes: if a lane mints a fresh uuid on resume, the ledger is
 * useless — the resumed lane produces a "new" key and double-fires the effect.
 * Keys therefore have to be derived from the causal chain, not from the moment
 * of execution:
 *
 *   key = sha256(laneId : checkpointSeq : effectIndex : kind)
 *
 * Two properties matter:
 *   - Resuming from the same checkpoint replays the same (checkpointSeq,
 *     effectIndex) pairs, so every re-attempt hits the existing ledger row and
 *     is absorbed instead of firing twice.
 *   - Forking advances the checkpoint sequence, so work that only exists after
 *     the fork gets fresh keys. Effects that happened before the fork keep
 *     their original keys and stay deduped.
 */

import { createHash } from "node:crypto";

export interface EffectIdentity {
  laneId: string;
  /** Monotonic checkpoint sequence within the lane; advances on fork only. */
  checkpointSeq: number;
  /** Ordinal of the effect within that checkpoint's replay window. */
  effectIndex: number;
  /** Effect kind, so "open PR" and "post comment" cannot collide. */
  kind: string;
}

export function effectKey(identity: EffectIdentity): string {
  const material = [
    identity.laneId,
    String(identity.checkpointSeq),
    String(identity.effectIndex),
    identity.kind,
  ].join(":");
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Guard for the resume path: refuse to apply an effect whose key is already in
 * the ledger. The caller inserts on success, so a crash between insert and
 * apply is still safe — the retry sees the row and skips.
 */
export function shouldApply(
  key: string,
  ledger: { has(key: string): boolean },
): boolean {
  return !ledger.has(key);
}
