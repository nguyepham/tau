import type { UUID } from "crypto";
import * as React from "react";
import { getOriginalCwd, getSessionId } from "../../bootstrap/state.js";
import { SessionTreeDialog } from "../../components/SessionTreeDialog.js";
import type { LocalJSXCommandContext } from "../../commands.js";
import type {
  LocalJSXCommandOnDone,
  ResumeEntrypoint,
} from "../../types/command.js";
import type { LogOption } from "../../types/logs.js";
import { logError } from "../../utils/log.js";
import { isLiteLog, loadFullLog } from "../../utils/sessionStorage.js";
import { buildSessionForest } from "../../utils/sessionTree.js";

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
): Promise<React.ReactNode> {
  const forest = await buildSessionForest(getOriginalCwd());
  if (forest.length === 0) {
    onDone("No sessions found in this project yet.");
    return null;
  }

  const handleSelect = async (sessionId: UUID, log: LogOption) => {
    if (sessionId === getSessionId()) {
      onDone("Already in this session.", { display: "system" });
      return;
    }
    try {
      const fullLog = isLiteLog(log) ? await loadFullLog(log) : log;
      // 'slash_command_picker' is the same entrypoint /resume uses when the
      // user picks a session out of its picker: keeps the resume code path
      // identical to a normal /resume so we don't introduce a new branch
      // through any cwd / auth / cache guard.
      const entrypoint: ResumeEntrypoint = "slash_command_picker";
      await context.resume?.(sessionId, fullLog, entrypoint);
      onDone(undefined, { display: "skip" });
    } catch (error) {
      logError(error as Error);
      onDone(`Failed to switch sessions: ${(error as Error).message}`);
    }
  };

  const handleCancel = () => {
    onDone(undefined, { display: "skip" });
  };

  return (
    <SessionTreeDialog
      forest={forest}
      activeSessionId={getSessionId()}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  );
}
