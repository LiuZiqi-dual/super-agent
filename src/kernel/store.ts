/**
 * SQLite-backed kernel store.
 *
 * Uses the built-in `node:sqlite` driver so the kernel has no third-party
 * runtime dependency. The schema is loaded from `schema/kernel.sql` so there is
 * exactly one source of truth for the on-disk shape.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Lane, LaneState } from "../types/lane.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = join(here, "..", "..", "schema", "kernel.sql");

export function openKernel(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

export interface SeedLane {
  id: string;
  threadId: string | null;
  goal: string;
  mode: "normal" | "speculative";
  state: LaneState;
  lastHeartbeat: string | null;
  checkpointRef: string | null;
  endpoint?: string | null;
}

export function insertLane(db: DatabaseSync, lane: SeedLane): void {
  db.prepare(
    `INSERT INTO lanes (id, thread_id, goal, mode, state, endpoint, last_heartbeat,
                        checkpoint_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    lane.id,
    lane.threadId,
    lane.goal,
    lane.mode,
    lane.state,
    lane.endpoint ?? null,
    lane.lastHeartbeat,
    lane.checkpointRef,
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

export function listLanes(db: DatabaseSync): Lane[] {
  const rows = db.prepare(`SELECT * FROM lanes`).all() as any[];
  return rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id,
    goal: r.goal,
    mode: r.mode,
    state: r.state,
    worktree: r.worktree,
    endpoint: r.endpoint,
    budgetUsed: r.budget_used,
    lastHeartbeat: r.last_heartbeat,
    sessionRef: r.session_ref,
    checkpointRef: r.checkpoint_ref,
    resultSummary: r.result_summary,
  }));
}

export function setLaneState(
  db: DatabaseSync,
  laneId: string,
  from: LaneState,
  to: LaneState,
  reason: string,
): void {
  const at = new Date().toISOString();
  db.prepare(`UPDATE lanes SET state = ?, updated_at = ? WHERE id = ?`).run(to, at, laneId);
  db.prepare(
    `INSERT INTO lane_transitions (lane_id, from_state, to_state, reason, at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(laneId, from, to, reason, at);
}

export function hasEffect(db: DatabaseSync, key: string): boolean {
  return db.prepare(`SELECT 1 FROM side_effects WHERE idempotency_key = ?`).get(key) !== undefined;
}

export function recordEffect(
  db: DatabaseSync,
  key: string,
  laneId: string,
  kind: string,
  resultRef?: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO side_effects (idempotency_key, lane_id, kind, applied_at, result_ref)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(key, laneId, kind, new Date().toISOString(), resultRef ?? null);
}

export function transitionLog(db: DatabaseSync): Array<{ laneId: string; to: string; reason: string }> {
  return (db.prepare(`SELECT lane_id, to_state, reason FROM lane_transitions ORDER BY id`).all() as any[]).map(
    (r) => ({ laneId: r.lane_id, to: r.to_state, reason: r.reason }),
  );
}
