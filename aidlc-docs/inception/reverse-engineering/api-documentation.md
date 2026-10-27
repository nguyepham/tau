# API Documentation

## REST and WebSocket APIs

Tau is primarily a local CLI and stdio protocol server, exposing local HTTP/WebSocket endpoints only when Remote Session mode (`/remote local` or `/remote global` via `src/services/remote/server.ts`) is explicitly started.

### Serve Remote Web UI Shell
- **Method**: `GET`
- **Path**: `/` or `/index.html`
- **Purpose**: Delivers the zero-cache single-page HTML/JS client (`REMOTE_HTML`) for mobile/browser pairing. Pairing secret remains in the URL `#fragment` (never sent in the HTTP page request).
- **Request**: Standard HTTP `GET` (default port `7777` or ephemeral fallback on `0.0.0.0`).
- **Response**: `200 OK` (`text/html; charset=utf-8`, `cache-control: no-store`, `x-content-type-options: nosniff`).

### Fetch Session Image Asset
- **Method**: `GET`
- **Path**: `/img/{contentHash}?t={token}`
- **Purpose**: Serves content-addressed session images (screenshots, terminal diagrams, attachments) interned in `src/services/remote/images.ts` to authenticated remote clients.
- **Request**: Path parameter `contentHash`; query parameter `t` validated via constant-time `timingSafeEqual` against the session token.
- **Response**: `200 OK` with binary image bytes and `cache-control: public, max-age=31536000, immutable`, or `403 Forbidden` / `404 Not Found`.

### Remote Session Bidirectional Stream
- **Method**: `GET` (HTTP `Upgrade: websocket`)
- **Path**: `/ws?t={token}`
- **Purpose**: Authenticated real-time bidirectional control channel between mobile/web clients and the live Tau session (`src/services/remote/server.ts`). Maintains 30s ping/pong heartbeats.
- **Request (Client -> Server JSON frames)**:
  - `{ "t": "prompt", "text": "<user prompt>" }` — Submit a prompt turn.
  - `{ "t": "interrupt" }` — Cancel active generation/tool execution.
  - `{ "t": "ask-response", "id": "<requestId>", "reply": <payload> }` — Answer a pending permission or `AskUserQuestion` prompt.
- **Response (Server -> Client JSON frames)**:
  - `{ "t": "hello", ...snapshot }` — Initial session state snapshot on connect.
  - Broadcast event frames for streamed assistant text, tool progress, and interactive permission/question forms (`src/services/remote/interactive.ts`).

### Stdio JSON-RPC Protocol Surfaces (Non-HTTP)
- **ACP Agent Server (`tau acp` - `src/acp/index.ts`)**: Speaks Agent Client Protocol (NDJSON JSON-RPC over `stdin`/`stdout`) for editors (VS Code, Zed, JetBrains). Diagnostics are strictly routed to `stderr`.
- **MCP Server & Client (`tau mcp` - `src/entrypoints/mcp.ts`, `src/services/mcp/`)**: Speaks Model Context Protocol over `stdio`, `SSE`, or `HTTP` transports to expose or consume tools, prompts, and resources.

## Internal APIs

### `QueryEngine` (`src/QueryEngine.ts`)
- **Methods**:
  - `submitMessage(prompt: string | ContentBlockParam[], options?): AsyncGenerator<SDKMessage, void>`
  - `interrupt(): void`
  - `getMessages(): Message[]`
- **Parameters**: Raw user prompt string or structured content blocks, optional turn configuration (model override, permission callbacks, thinking config).
- **Return Types**: Async stream of `SDKMessage` events updating UI/SDK consumers and persisting session transcripts.

### `Lane` & Dispatcher (`src/lanes/types.ts`, `src/lanes/dispatcher.ts`)
- **Methods**:
  - `registerLane(lane: Lane): void`
  - `resolveRoute(model: string): RouteDecision`
  - `lane.supportsModel(model: string): boolean`
  - `lane.run(context: LaneRunContext): AsyncGenerator<AnthropicStreamEvent, LaneRunResult>`
  - `lane.streamAsProvider?(params: LaneProviderCallParams): AsyncGenerator<AnthropicStreamEvent, NormalizedUsage>`
  - `lane.listModels(providerFilter?: string): Promise<ModelInfo[]>`
- **Parameters**: Model identifier string, `LaneRunContext` (system blocks, conversation history, tool executor callback, abort signal) or `LaneProviderCallParams`.
- **Return Types**: `RouteDecision` (`native` lane vs `existing` path); async stream of `AnthropicStreamEvent` items plus final `NormalizedUsage`.

### `BaseProvider` (`src/services/api/providers/base_provider.ts`)
- **Methods**:
  - `stream(params: ProviderRequestParams): Promise<ProviderStreamResult>`
  - `create(params: ProviderRequestParams): Promise<AnthropicMessage>`
  - `listModels(): Promise<ModelInfo[]>`
  - `resolveModel(claudeModel: string): string`
- **Parameters**: `ProviderRequestParams` (model, `SystemBlock[]`, `ProviderMessage[]`, `ProviderTool[]`, maxTokens, temperature, thinking budget, abort signal).
- **Return Types**: `ProviderStreamResult` (async event iterator + usage promise), `AnthropicMessage`, or `ModelInfo[]`.

### `Tool` & `buildTool` (`src/Tool.ts`)
- **Methods**:
  - `buildTool<D extends AnyToolDef>(def: D): BuiltTool<D>`
  - `tool.call(input: z.infer<Input>, context: ToolUseContext, canUseTool: CanUseToolFn, parentMessage: AssistantMessage, onProgress?): Promise<ToolResult<Output>>`
  - `tool.checkPermissions(input: z.infer<Input>, context: ToolUseContext): Promise<PermissionResult>`
- **Parameters**: `ToolDef` specification (name, description, `inputSchema`, `call`, optional UI renderers and safety overrides).
- **Return Types**: Complete `Tool` object with guaranteed defaults (`isEnabled`, `isConcurrencySafe`, `isReadOnly`, `isDestructive`, `checkPermissions`).

## Data Models

### `Message` (`src/types/message.ts`)
- **Fields**: Discriminated union by `type` (`'user' | 'assistant' | 'attachment' | 'progress' | 'system'`), `uuid`, `timestamp`, `message` (Anthropic-shaped role + content blocks), usage metadata, and tool result attachments.
- **Relationships**: Stored in ordered arrays inside `QueryEngine` and serialized as JSONL transcripts by `src/utils/sessionStorage.ts`.
- **Validation**: Content blocks validated before provider dispatch via `sanitizeProviderMessages.ts`.

### `AnthropicStreamEvent` & `ModelInfo` (`src/services/api/providers/base_provider.ts`)
- **Fields**:
  - `AnthropicStreamEvent`: Normalized streaming event (`message_start`, `content_block_start`, `content_block_delta` for text/thinking/input_json, `content_block_stop`, `message_delta`, `message_stop`).
  - `ModelInfo`: `id`, `name`, `provider`, `contextWindow`, `maxOutputTokens`, pricing fields, vision/tool support flags, and reasoning effort ladders.
- **Relationships**: Emitted by every `Lane` and `BaseProvider`; consumed by `QueryEngine`, `cost-tracker.ts`, and `/models` UI pickers.
- **Validation**: Enforced by shared lane invariant tests (`src/lanes/shared/invariants.test.ts`).

### `PermissionResult` (`src/types/permissions.ts`)
- **Fields**: Discriminated union on `behavior`: `{ behavior: 'allow', updatedInput, decisionReason? }` | `{ behavior: 'deny', message, interrupt? }` | `{ behavior: 'ask', message?, suggestions? }`.
- **Relationships**: Produced by `Tool.checkPermissions`, settings rules (`settings.json`), Go shell-parser AST classifier (`src/utils/bash/`), and interactive approval UI (`useCanUseTool.ts`).
- **Validation**: Schema-checked via `zod` settings schemas (`src/schemas/`, `src/utils/settings/`).
