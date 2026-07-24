export const REMOTE_TRIGGER_TOOL_NAME = "RemoteTrigger";

export const DESCRIPTION =
  "Manage scheduled remote Zen agents (triggers) via the claude.ai CCR API. Auth handled in-process — token never reaches the shell.";

export const PROMPT = `Call claude.ai remote-trigger API. Use instead of curl — OAuth token added automatically in-process, never exposed.

Actions:
- list: GET /v1/code/triggers
- get: GET /v1/code/triggers/{trigger_id}
- create: POST /v1/code/triggers (requires body)
- update: POST /v1/code/triggers/{trigger_id} (requires body, partial update)
- run: POST /v1/code/triggers/{trigger_id}/run

Response is raw JSON from API.`;
