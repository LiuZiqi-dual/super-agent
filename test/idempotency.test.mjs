import test from "node:test";
import assert from "node:assert/strict";
import { effectKey, shouldApply } from "../src/kernel/idempotency.ts";

const base = { laneId: "lane-7f3", checkpointSeq: 1, effectIndex: 2, kind: "pr.open" };

test("resume from the same checkpoint reproduces the same key", () => {
  assert.equal(effectKey(base), effectKey({ ...base }));
});

test("a different checkpoint sequence mints a different key", () => {
  assert.notEqual(effectKey(base), effectKey({ ...base, checkpointSeq: 2 }));
});

test("different effect ordinals never collide", () => {
  assert.notEqual(effectKey(base), effectKey({ ...base, effectIndex: 3 }));
});

test("effect kinds are namespaced", () => {
  assert.notEqual(effectKey(base), effectKey({ ...base, kind: "comment.post" }));
});

test("the ledger absorbs a replayed key", () => {
  const seen = new Set([effectKey(base)]);
  assert.equal(shouldApply(effectKey(base), { has: (k) => seen.has(k) }), false);
  const next = effectKey({ ...base, effectIndex: 3 });
  assert.equal(shouldApply(next, { has: (k) => seen.has(k) }), true);
});
