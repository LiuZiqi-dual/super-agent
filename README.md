# Super Agent

An always-on, event-driven AI harness. Not a wrapper around one agent CLI — a runtime that owns orchestration itself: a provider-agnostic brain, pluggable model backends, and multi-model collaboration under a single coordinator.

**Status (2026-11-20):** architecture and research complete, zero code. The prototype is being built with Devin Bots. Everything below is the design being implemented, not a description of shipped software.

## What it is

- **Provider-agnostic brain.** Model backends are interchangeable; no single vendor's orchestration semantics are load-bearing. Claude Code's session/resume/fork and cross-session messaging are treated as a reference implementation, not a foundation.
- **Always-on, event-driven.** Inbound events from GitHub, Sentry, Linear and chat channels are normalized, filtered, coalesced into threads, and routed into parallel work lanes.
- **Lane coordinator.** Lanes are state machines (`CREATED → RUNNING → IDLE → RUNNING → DONE/FAILED`, plus `WAITING_FOR_ENDPOINT`). Compute is stateless and restartable; state lives in a persistent registry plus the lane transcript, so a crash is a normal event rather than corruption.
- **Restart safety.** Registry replay on restart, resume from the last known-good checkpoint, fork instead of resume when context is corrupt, and idempotency keys on side effects so a resumed lane cannot double-apply.
- **Context discipline.** Triggers carry pointers, not payloads. Full text lives in a spill store and is pulled on demand. Compaction persists the active task index and reinjects it on session start, so the index survives even when detail does not.
- **Backpressure.** Per-source fast-path policy (ignore / explicit-only / candidate), dedupe on `(source, external_id)`, per-thread rate caps, coalescing into a single batch message while the router is busy, concurrency caps and speculative TTL to avoid retry storms.

## Architecture sketch

```
Event sources ──► Fast-path filter ──► Thread coalescer ──► Subscription router ──► Lane inbox
                        │                     │                    │
                        │                     │                    └─► Slow path: batched router dispatch
                        │                     └─► Registry (threads, subscriptions, lanes)
                        └─► Shadow log (pass-through events, no wakeup)
```

- **Kernel**: event ingest, routing, batching, registry, watchdog.
- **Router**: long-lived single session that talks to the human and dispatches lanes; no file-editing tools, so it cannot be blocked by a build.
- **Workers**: short-lived processes over persistent sessions, isolated per worktree, reporting through the registry.

## Roadmap

1. Event kernel + lane scheduler, with a `kill -9` recovery demo (hard kill, clean resume).
2. Provider abstraction and multi-model routing.
3. Subscription routing and coalescing with real GitHub/Sentry/Linear inputs.
4. Web console for lanes, budgets and live transcripts.

## Docs

`docs/research/` holds the design record: architecture, capability checks, trade-off reviews, and source material. `docs/design/` holds the UI prototypes.
