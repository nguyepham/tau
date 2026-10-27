# Working Conventions

Implicit codebase conventions observed directly from source and build configurations. Every entry cites its concrete provenance in `/home/nguyepham/f/tau`.

## Module Resolution and Import Specifiers
- **Root-Relative `src/*` Alias + Explicit `.js` Extension**: TypeScript modules import either via the `src/*` path alias (`tsconfig.json:3-8`, e.g., `import { getSessionId } from 'src/bootstrap/state.js'` in `src/QueryEngine.ts:7-9`) or relative paths with explicit `.js` suffixes (`./commands.js`, `../utils/debug.js`), which `build.mjs:214-225` maps back to `.ts` / `.tsx` at bundle time.
- **Type-Only Imports & Cycle Breaking**: Shared types are imported with `import type { ... }` and placed in `src/types/*` (`src/types/permissions.ts`, `src/types/tools.ts`, `src/types/message.ts`) to break circular dependencies (`src/Tool.ts:39-57`).
- **Build-Time Feature Gating (`bun:bundle`)**: Internal/experimental features import `import { feature } from 'bun:bundle'` (`src/QueryEngine.ts:1`), which `build.mjs:147-154` shims to `export function feature(_name) { return false; }` in external builds.

## Tool Authoring Conventions
- **Mandatory `buildTool()` Factory**: All tools live in `src/tools/<ToolName>Tool/` and are exported through `buildTool(...)` (`src/Tool.ts:819-825`) rather than raw object literals. Because `TOOL_DEFAULTS` (`src/Tool.ts:793-805`) is fail-closed (`isReadOnly: false`, `isConcurrencySafe: false`), read-only parallelizable tools must explicitly override `isReadOnly: () => true` and `isConcurrencySafe: () => true`.
- **Zod Input Schemas**: Tool parameters are declared with `zod` schemas (`inputSchema`), which drive both runtime validation and provider JSON Schema emission (`src/Tool.ts:13-22`).
- **Centralized Cycle-Safe Types**: Progress payloads (`ToolProgressData`) and `PermissionResult` live in `src/types/tools.ts` and `src/types/permissions.ts`, never defined ad-hoc inside individual UI components.

## Multi-Provider and Lane Conventions
- **Native Wire Format Inside, `AnthropicStreamEvent` Outside**: Provider integrations in `src/lanes/<family>/` and `src/services/api/providers/*_provider.ts` speak each provider's native API directly (no proxy layer) and yield `AnthropicStreamEvent` items (`src/lanes/types.ts:9-13`, `src/services/api/providers/base_provider.ts:69-145`).
- **Provider Message & Schema Sanitization**: Before dispatching tool schemas or conversation history to non-Anthropic providers, adapters sanitize unsupported JSON Schema keywords and orphan tool blocks (`src/services/api/providers/sanitizeProviderMessages.ts`, `src/lanes/shared/`).
- **Live Catalog Metadata Over Hardcoded Tables**: Reasoning-effort ladders, context windows, and pricing for dynamic providers (xAI, Alibaba, LXD, OpenRouter) are read from provider catalog responses and persisted per-user under `~/.claude/*.json` (`PROVIDERS.md:20-39, 77-115`).

## UI, Stdio, and Security Conventions
- **Protocol Stdout Purity**: Any stdio protocol mode (`src/acp/index.ts:13-16`, `src/entrypoints/mcp.ts`) treats `stdout` exclusively as the wire channel; debug/error output must use `logForDebugging` / `logError` (`src/utils/debug.ts`, `src/utils/log.ts`) writing to logs or `stderr`.
- **CJS Package Registration in `build.mjs`**: Adding a CommonJS npm runtime dependency imported with named ESM syntax (`import { foo } from 'pkg'`) requires adding the package name to `cjsPackages` in `build.mjs:306-310` so Node strict ESM execution succeeds in `dist/tau.mjs`.
- **Shadow Git Isolation**: Workspace snapshot features (`src/tools/SnapshotTool/`, `README.md:103-105`) must use an isolated shadow git directory and never mutate the user's `.git` refs, index, or hooks.

## Testing Conventions
- **Dual Test Placement and Runners**:
  - Fast unit tests for lanes, commands, and UI helpers are co-located next to source as `<module>.test.ts` or `<module>.test.tsx` (271 files; executed via `node --test` or `bun test` depending on `node:test` vs `bun:test` import).
  - Cross-cutting, packaging, CLI contract, and fixture tests reside under `test/*.test.mjs` (166 files) using `node:test` and `node:assert/strict` (`package.json:43-45`).
