export const REMOTE_TRIGGER_TOOL_NAME = 'RemoteTrigger'

export const DESCRIPTION =
  'Manage scheduled remote Tau triggers via claude.ai API. In-process auth.'

export const PROMPT = `Call claude.ai remote-trigger API. In-process OAuth token handling.

Actions:
- \`list\`: GET /v1/code/triggers
- \`get\`: GET /v1/code/triggers/{trigger_id}
- \`create\`: POST /v1/code/triggers (body required)
- \`update\`: POST /v1/code/triggers/{trigger_id} (body required)
- \`run\`: POST /v1/code/triggers/{trigger_id}/run

Returns raw JSON response.`
