# CLAUDE.md

This file provides guidance to Tau when working with code in this repository.

## Development & Build Commands

**Runtime prerequisites:** Node.js `>=20.19.0 <21.0.0 || >=22.12.0` (`require(esm)` required), `rg` (ripgrep), Git, Go `1.25.8+` (for native Go helpers), and optional Rust/Cargo + CMake (for `native/tau-voice`) or Bun (for `build:bun` and `src/` TypeScript tests).

```bash
# Install & build
npm ci
npm run build                  # Primary build (build.mjs): esbuild -> dist/tau.mjs + dist/cli.mjs + Go helpers
npm run build:bun              # Alternate Bun bundler path (build.ts)
npm run build:native-shell     # Rebuild Go shell AST parser (native/shell-parser)
npm run build:native-tools     # Rebuild Go TUI/fuzzy/git helper (native/tau-tools)
npm run build:native-voice     # Rebuild Rust N-API Opus/WebRTC voice addon (native/tau-voice)

# Run local checkout
node dist/cli.mjs              # Interactive TUI (runs install/runtime preflight first)
TAU_SKIP_PREFLIGHT=1 node dist/cli.mjs -p "prompt"  # Fast headless run skipping preflight
node dist/cli.mjs acp          # Agent Client Protocol stdio server

# Release & packaging checks
npm run shrinkwrap:check       # Validate production shrinkwrap (canonical under npm@11)
npm run shrinkwrap:generate    # Regenerate production shrinkwrap
npm run voice:sync-packages    # Sync native voice binaries into platform-packages/tau-voice-*
npm run voice:release-check    # Verify native voice release artifacts
```

### Running Tests & Static Checks

There is no unified root `npm test` or root ESLint/Biome config. Tests use three execution conventions depending on location and runner imports (mirroring `.github/workflows/ci.yml`):

```bash
# 1. Integration, CLI contract & packaging tests (test/*.test.mjs, packages/*/test/*.test.mjs)
node --test test/auth-port-owners.test.mjs
node --test packages/tau-installer/test/installer.test.mjs
node test/mcp-setup-launch.test.mjs          # Standalone script (do not pass --test)

# 2. Co-located TypeScript unit tests importing 'bun:test'
bun test src/lanes/openai-compat/opencode_zen.test.ts

# 3. Co-located standalone TypeScript assertion scripts (no 'bun:test' import)
bun run src/lanes/codex/codex.test.ts
bun run src/utils/execFileNoThrow.test.ts

# Named package scripts
npm run test:auth              # node --test test/auth-port-owners.test.mjs
npm run test:voice             # node scripts/test-voice.mjs
npm run test:voice-packages    # node --test test/voice-platform-packages.test.mjs

# VS Code extensions (separate subprojects, both named "tau-vscode" in their manifests)
npm --prefix editors/vscode run build        # ACP sidebar chat extension (esbuild)
npm --prefix tau-vscode test                 # Terminal companion extension tests
npm --prefix tau-vscode run lint             # Terminal companion lint script
```

**Typechecking caveat:** Whole-repo `npx tsc --noEmit` fails on stripped modules that `build.mjs` redirects to `dist/shim.js`. Validate compilation via `npm run build` plus targeted unit/esbuild tests.

## Architecture Overview

Tau (`@abdoknbgit/tau`) is a multi-surface AI coding agent harness that pairs a shared tool/session/UI core with direct native protocol adapters across 30 LLM providers (`PROVIDERS.md`).

### 1. Two-Stage Bundle & Self-Healing Preflight (`build.mjs`, `dist/cli.mjs` -> `dist/tau.mjs`)
- **Preflight launcher (`dist/cli.mjs`)**: Zero-dependency entry bound to `tau` and `claudex`. Validates Node `require(esm)` support (re-execing a compatible Node binary when available), checks `.tau-lifecycle-complete.json` and `node_modules` via `scripts/verify-deps.mjs` (recovering when npm 11.16+/12 blocks lifecycle scripts), then dynamically imports `dist/tau.mjs`.
- **Main bundle (`dist/tau.mjs`)**: Built from `src/entrypoints/cli.tsx` -> `src/main.tsx` (`commander` flags and subcommands: interactive REPL, `-p`/`--print`, `mcp`, `plugin`, `acp`, `update`).
- **Build-time shims & CJS interop (`build.mjs`)**:
  - `import { feature } from 'bun:bundle'` is shimmed to return `false` in external builds.
  - Unresolved repo-local or `@ant/*` imports silently resolve to `dist/shim.js` (a no-op `Proxy` + stub exports) rather than failing `esbuild`. Verify relative/alias import paths carefully when refactoring.
  - Adding a CommonJS npm runtime dependency imported with ESM named imports (`import { x } from 'pkg'`) requires adding the package name to `cjsPackages` in `build.mjs` so strict Node ESM execution succeeds.
  - Lifecycle script policy (`"allowScripts"` in `package.json`) must stay synchronized with `ALLOWED_SCRIPTS` in `packages/tau-installer/lib/installer.mjs`.

### 2. Entry Surfaces & Core Turn Loop (`src/QueryEngine.ts`, `src/query.ts`)
All user surfaces drive `QueryEngine`:
- **Interactive TUI (`src/screens/REPL.tsx`, `src/ink/`)**: Custom React 19 terminal reconciler (`src/ink/`) supporting ANSI Flexbox layout, Sixel/Kitty graphics, terminal Mermaid diagrams (`grok-mermaid`), Unicode LaTeX rendering, and mouse hit-testing.
- **Headless CLI (`src/cli/print.ts`)**: Non-interactive `--print` execution and SDK stream output.
- **ACP Server (`src/acp/`)**: Agent Client Protocol NDJSON JSON-RPC over `stdin`/`stdout` consumed by `editors/vscode/` and other ACP editors.
- **Remote Session Server (`src/services/remote/`)**: `/remote local` and `/remote global` (`cloudflared` tunnel) serve an embedded web UI and WebSocket stream (`/ws`, default `0.0.0.0:7777`). Pairing secrets stay in the URL `#fragment` and tokens are verified with `crypto.timingSafeEqual`.

`QueryEngine` assembles system prompt sections (`CLAUDE.md`, project `AGENTS.md`/Cursor/Copilot/Cline/Windsurf rules, `src/memdir/` auto-memory, `.claude`/`.agents` skills, MCP server instructions), manages context compaction (`src/services/compact/`), tracks usage/cost (`src/cost-tracker.ts`), and writes JSONL transcripts (`src/utils/sessionStorage.ts`).

### 3. Native Multi-Provider Lanes & Normalized Streaming IR (`src/lanes/`, `src/services/api/`)
- **No translation proxy**: `LaneDispatcher` (`src/lanes/dispatcher.ts`) routes model IDs to model-family lanes (`src/lanes/{claude,codex,gemini,openai-compat,cursor,cline,kiro,qwen,kilo}/`) or `BaseProvider` subclasses (`src/services/api/providers/*_provider.ts`).
- **Native wire in, `AnthropicStreamEvent` out**: Each lane/provider speaks its upstream API natively (Anthropic Messages, OpenAI Responses/WebSocket, Gemini generateContent/Code Assist, Bedrock, Ollama, etc.), preserves provider prompt caching and reasoning-effort ladders (caching live catalog metadata under `~/.claude/*.json`), and yields normalized `AnthropicStreamEvent` items (`src/lanes/types.ts`, `src/services/api/providers/base_provider.ts`) so `QueryEngine` and UI components remain provider-agnostic.
- **Outbound sanitization**: Non-Anthropic adapters strip unsupported JSON Schema keywords and repair orphan tool blocks via `src/services/api/providers/sanitizeProviderMessages.ts` and `src/lanes/shared/`.

### 4. Tool Execution, Permissions & Context Efficiency (`src/Tool.ts`, `src/services/tools/`, `src/tools/`)
- **Fail-closed `buildTool()` factory (`src/Tool.ts`)**: Every tool in `src/tools/<Name>Tool/` (registered in `src/tools.ts`) must be constructed with `buildTool(...)` and a `zod` `inputSchema`. `TOOL_DEFAULTS` defaults `isReadOnly`, `isConcurrencySafe`, and `isDestructive` to `false`; read-only parallelizable tools must explicitly override `isReadOnly: () => true` and `isConcurrencySafe: () => true`.
- **Execution pipeline (`src/services/tools/toolExecution.ts`)**: Validates Zod schemas, partitions read-only concurrent batches vs serial mutating calls, evaluates permission rules (`src/utils/permissions/`) + Go AST shell classification (`native/shell-parser`, `src/utils/bash/`), runs `PreToolUse`/`PostToolUse` hooks (`src/utils/hooks.ts`), and persists oversized outputs to disk with preview handles (`src/utils/toolResultStorage.ts` + `ToolOutputRetrieveTool`).
- **Operating modes (`/mode`)**: `cheap` mode (`src/constants/cheapModeTools.ts`) restricts the active toolset and tightens output byte caps to preserve prompt cache prefixes; `normal` mode exposes configured optional tools, skills, subagents, and MCP servers.
- **Stateful & isolated subsystems**:
  - `src/tools/EvalTool/`: Persistent Python kernel retaining variables across turns with `tool.*` bridge callbacks into Tau tools.
  - `src/tools/SnapshotTool/`: Workspace snapshots stored in an isolated shadow git repo — never touches the project's `.git` refs, index, or hooks.
  - `src/tools/AgentTool/` & `SendMessageTool`: Resumable foreground/background subagents with file-edit serialization, optional worktree isolation, and independent subagent provider/model routing.
  - `src/services/browser/`: Chromium automation over Chrome DevTools Protocol (`@N` ref observation, layout measurement, console/network capture).
  - `src/services/lsp/`: Background language-server diagnostics (disabled by default; enabled via `lspEnabled` in `.claude/settings.local.json` or `/config`).

## Key Codebase Conventions

- **Import specifiers**: Use either the `src/*` path alias (`tsconfig.json`) or relative paths with explicit `.js` suffixes (`./foo.js`), which `build.mjs` resolves to `.ts`/`.tsx`. Use `import type` and shared definitions in `src/types/*` (`permissions.ts`, `command.ts`, `hooks.ts`, `plugin.ts`) to avoid circular dependencies.
- **Stdio protocol purity**: In `tau acp` (`src/acp/`) and `tau mcp` (`src/entrypoints/mcp.ts`), `stdout` carries JSON-RPC frames exclusively. Route all logging through `logForDebugging` / `logError` (`src/utils/debug.ts`, `src/utils/log.ts`) to `stderr` or log files.
- **Shell tool environment**: Commands run by `BashTool` and `PowerShellTool` receive `AI_AGENT=tau` and `TAU_SESSION_ID`, plus `TAU_PROVIDER`, `TAU_MODEL`, and (when applicable) `TAU_EFFORT` on model-initiated runs.
- **Two VS Code extensions**: `editors/vscode/` is the ACP webview chat extension (`v0.1.0`); `tau-vscode/` is the terminal-launch + inline-diff IDE companion (`v0.6.0`). Verify which extension is targeted before editing.
