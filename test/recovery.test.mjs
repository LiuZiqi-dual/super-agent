import test from "node:test";
import assert from "node:assert/strict";
import {
  openKernel, insertLane, listLanes, setLaneState, transitionLog,
  hasEffect, recordEffect,
} from "../src/kernel/store.ts";
import { planRecovery, recoveredState } from "../src/kernel/recover.ts";
import { effectKey } from "../src/kernel/idempotency.ts";

const now = "2026-11-20T12:00:00.000Z";
const stale = "2026-11-20T11:00:00.000Z";
const fresh = "2026-11-20T11:59:30.000Z";

function seed() {
  const db = openKernel(":memory:");
  insertLane(db, { id: "lane-orphan", threadId: null, goal: "g1", mode: "normal",
    state: "RUNNING", lastHeartbeat: stale, checkpointRef: "ckpt-1" });
  insertLane(db, { id: "lane-corrupt", threadId: null, goal: "g2", mode: "normal",
    state: "RUNNING", lastHeartbeat: stale, checkpointRef: "ckpt-bad" });
  insertLane(db, { id: "lane-live", threadId: null, goal: "g3", mode: "normal",
    state: "RUNNING", lastHeartbeat: fresh, checkpointRef: "ckpt-2" });
  insertLane(db, { id: "lane-done", threadId: null, goal: "g4", mode: "normal",
    state: "DONE", lastHeartbeat: stale, checkpointRef: "ckpt-3" });
  return db;
}

test("boot recovery demotes orphans, forks corrupt tails, holds live owners", () => {
  const db = seed();
  const actions = planRecovery(listLanes(db), {
    now,
    heartbeatTimeoutMs: 15 * 60 * 1000,
    checkpointHealthy: (ref) => ref !== "ckpt-bad",
    endpointOnline: () => true,
  });
  const byLane = Object.fromEntries(actions.map((a) => [a.laneId, a.kind]));
  assert.equal(byLane["lane-orphan"], "resume");
  assert.equal(byLane["lane-corrupt"], "fork");
  assert.equal(byLane["lane-live"], "hold");
  assert.equal(byLane["lane-done"], undefined);
});

test("applying recovery writes an audited transition per lane", () => {
  const db = seed();
  const actions = planRecovery(listLanes(db), {
    now,
    heartbeatTimeoutMs: 15 * 60 * 1000,
    checkpointHealthy: (ref) => ref !== "ckpt-bad",
    endpointOnline: () => true,
  });
  for (const action of actions) {
    const next = recoveredState(action);
    if (next === null) continue;
    setLaneState(db, action.laneId, "RUNNING", next, action.kind);
  }
  const log = transitionLog(db);
  assert.deepEqual(log.map((l) => l.laneId).sort(), ["lane-corrupt", "lane-orphan"]);
  assert.ok(log.every((l) => l.to === "IDLE"));
});

test("a resumed lane cannot fire the same side effect twice", () => {
  const db = seed();
  const key = effectKey({ laneId: "lane-orphan", checkpointSeq: 1, effectIndex: 2, kind: "pr.open" });
  recordEffect(db, key, "lane-orphan", "pr.open", "https://github.com/x/y/pull/1");
  assert.equal(hasEffect(db, key), true);
  // replay after a crash
  recordEffect(db, key, "lane-orphan", "pr.open", "https://github.com/x/y/pull/1");
  const count = db.prepare("SELECT COUNT(*) AS n FROM side_effects").get().n;
  assert.equal(count, 1);
});
