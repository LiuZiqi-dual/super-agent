/**
 * Boot-time recovery planning.
 *
 * This runs before any lane is allowed to execute. It reads the durable rows,
 * decides one action per lane, and never trusts in-memory state: the kernel can
 * be killed at any point and the next boot reaches the same decisions.
 *
 * Rules, in order:
 *   1. A RUNNING lane whose heartbeat is stale is presumed orphaned: its process
 *      is gone, its session is not. Demote to IDLE, then decide resume vs fork.
 *   2. A lane with a healthy checkpoint resumes; an unreadable or looping tail
 *      forks from the last known-good checkpoint instead of replaying garbage.
 *   3. A lane pinned to an endpoint that has not reported in stays held; its
 *      events keep accumulating in the inbox.
 *   4. Terminal lanes are skipped.
 */

import type {
  Lane,
  RecoveryAction,
  RecoveryContext,
  LaneState,
} from "../types/lane.js";
import { isTerminal } from "../types/lane.js";

export function planRecovery(
  lanes: readonly Lane[],
  ctx: RecoveryContext,
): RecoveryAction[] {
  const actions: RecoveryAction[] = [];
  const now = Date.parse(ctx.now);

  for (const lane of lanes) {
    if (isTerminal(lane.state)) continue;

    if (lane.state === "WAITING_FOR_ENDPOINT" && !ctx.endpointOnline(lane.endpoint)) {
      actions.push({ kind: "hold", laneId: lane.id, reason: "endpoint offline" });
      continue;
    }

    const heartbeatAge =
      lane.lastHeartbeat === null ? Infinity : now - Date.parse(lane.lastHeartbeat);
    const orphaned =
      lane.state === "RUNNING" && heartbeatAge > ctx.heartbeatTimeoutMs;

    if (lane.state === "CREATED") {
      actions.push({
        kind: "resume",
        laneId: lane.id,
        checkpointRef: lane.checkpointRef ?? "",
      });
      continue;
    }

    if (orphaned || lane.state === "IDLE") {
      if (lane.checkpointRef === null) {
        actions.push({ kind: "reap", laneId: lane.id, reason: "no checkpoint" });
      } else if (ctx.checkpointHealthy(lane.checkpointRef)) {
        actions.push({
          kind: "resume",
          laneId: lane.id,
          checkpointRef: lane.checkpointRef,
        });
      } else {
        actions.push({
          kind: "fork",
          laneId: lane.id,
          checkpointRef: lane.checkpointRef,
          reason: "checkpoint tail unreadable or looping",
        });
      }
      continue;
    }

    // RUNNING with a fresh heartbeat: another process still owns it.
    actions.push({ kind: "hold", laneId: lane.id, reason: "live owner" });
  }

  return actions;
}

/**
 * The state a recovered lane is written back as, before its process is spawned.
 * Kept separate from planRecovery so the decision can be audited without being
 * applied.
 */
export function recoveredState(action: RecoveryAction): LaneState | null {
  switch (action.kind) {
    case "resume":
    case "fork":
      return "IDLE";
    case "reap":
      return "FAILED";
    case "hold":
      return null;
  }
}
