/**
 * Lane model for the Super Agent kernel.
 *
 * A lane is a state machine, not a process. The process is disposable; the lane
 * row and its session checkpoint are the durable part. That separation is what
 * makes a hard kill a normal event instead of corruption.
 */

export type LaneState =
  | "CREATED"
  | "RUNNING"
  | "IDLE"
  | "WAITING_FOR_ENDPOINT"
  | "DONE"
  | "FAILED"
  | "DISCARDED";

export type LaneMode = "normal" | "speculative";

export interface Lane {
  id: string;
  threadId: string;
  goal: string;
  mode: LaneMode;
  state: LaneState;
  /** Worktree the lane owns. Never shared between live lanes. */
  worktree: string | null;
  /** Endpoint the lane is pinned to, when it must run next to its environment. */
  endpoint: string | null;
  budgetUsed: number;
  /** Heartbeat from the owning process; stale means the process is gone. */
  lastHeartbeat: string | null;
  /** Opaque handle to the resumable session (provider-agnostic). */
  sessionRef: string | null;
  /** Last known-good checkpoint; resume from here, fork when the tail is corrupt. */
  checkpointRef: string | null;
  resultSummary: string | null;
}

export const TERMINAL_STATES: readonly LaneState[] = ["DONE", "FAILED", "DISCARDED"];

export function isTerminal(state: LaneState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Legal transitions. Anything not listed is a bug, not a retry.
 * `RUNNING -> IDLE` is the process-exit path; `IDLE -> RUNNING` is a wakeup.
 */
const TRANSITIONS: Record<LaneState, readonly LaneState[]> = {
  CREATED: ["RUNNING", "FAILED", "DISCARDED"],
  RUNNING: ["IDLE", "WAITING_FOR_ENDPOINT", "DONE", "FAILED", "DISCARDED"],
  IDLE: ["RUNNING", "DONE", "FAILED", "DISCARDED"],
  WAITING_FOR_ENDPOINT: ["RUNNING", "FAILED", "DISCARDED"],
  DONE: [],
  FAILED: [],
  DISCARDED: [],
};

export function canTransition(from: LaneState, to: LaneState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** A recovery decision, computed from a lane row plus boot-time facts. */
export type RecoveryAction =
  | { kind: "resume"; laneId: string; checkpointRef: string }
  | { kind: "fork"; laneId: string; checkpointRef: string; reason: string }
  | { kind: "reap"; laneId: string; reason: string }
  | { kind: "hold"; laneId: string; reason: string };

export interface RecoveryContext {
  now: string;
  /** Heartbeat age beyond which the owning process is presumed dead. */
  heartbeatTimeoutMs: number;
  /** Whether the lane's checkpoint still parses and replays. */
  checkpointHealthy: (checkpointRef: string | null) => boolean;
  /** Whether the lane's endpoint reported in since boot. */
  endpointOnline: (endpoint: string | null) => boolean;
}
