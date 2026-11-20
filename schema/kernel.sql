-- Super Agent kernel schema (SQLite, WAL).
-- State is durable and append-only where it matters; lanes carry the mutable
-- head so recovery can replay from a known-good checkpoint.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Provider events, addressed by identity only. Payload lives in the spill store.
CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,
  kind          TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  payload_ref   TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  dedupe_key    TEXT NOT NULL,
  -- Re-delivery of the same provider event must not create a second row.
  UNIQUE (dedupe_key)
);
CREATE INDEX events_by_thread ON events (thread_id, received_at);

-- Coalescing unit: one PR, one incident, one chat topic.
CREATE TABLE threads (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  title         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (source, external_id)
);

-- Fast path: a subscribed lane gets the event directly, the router stays asleep.
CREATE TABLE subscriptions (
  thread_id     TEXT NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  lane_id       TEXT NOT NULL,
  role          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (thread_id, lane_id, role)
);

-- Lane head. Mutable, but every mutation is mirrored into lane_transitions.
CREATE TABLE lanes (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT REFERENCES threads (id),
  goal            TEXT NOT NULL,
  mode            TEXT NOT NULL CHECK (mode IN ('normal', 'speculative')),
  state           TEXT NOT NULL CHECK (state IN (
                    'CREATED', 'RUNNING', 'IDLE', 'WAITING_FOR_ENDPOINT',
                    'DONE', 'FAILED', 'DISCARDED')),
  worktree        TEXT,
  endpoint        TEXT,
  budget_used     REAL NOT NULL DEFAULT 0,
  last_heartbeat  TEXT,
  session_ref     TEXT,
  checkpoint_ref  TEXT,
  result_summary  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX lanes_by_state ON lanes (state);
CREATE INDEX lanes_by_heartbeat ON lanes (last_heartbeat);

-- Append-only audit of every state change. Recovery reads this, never the head alone.
CREATE TABLE lane_transitions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lane_id     TEXT NOT NULL REFERENCES lanes (id) ON DELETE CASCADE,
  from_state  TEXT NOT NULL,
  to_state    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  at          TEXT NOT NULL
);

-- Idempotency ledger for externally visible effects (PR opened, message sent).
-- A resumed lane re-attempts the effect and the ledger absorbs the duplicate.
CREATE TABLE side_effects (
  idempotency_key TEXT PRIMARY KEY,
  lane_id         TEXT NOT NULL REFERENCES lanes (id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  applied_at      TEXT NOT NULL,
  result_ref      TEXT
);

-- Slow-path queue. Rows are coalesced into one batch message per router turn.
CREATE TABLE trigger_queue (
  event_id    TEXT PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  enqueued_at TEXT NOT NULL,
  batch_id    TEXT
);
CREATE INDEX trigger_queue_unbatched ON trigger_queue (batch_id, enqueued_at);

-- Pass-through events the router never saw awake; surfaced as one line next wake.
CREATE TABLE shadow_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    TEXT NOT NULL,
  lane_id     TEXT,
  at          TEXT NOT NULL
);
