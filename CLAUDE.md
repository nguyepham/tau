# CLAUDE.md

This file provides guidance to Tau when working with code in this repository.

## Commands

### Build
- Build CLI bundle (`dist/tau.mjs` + `dist/cli.mjs`): `node build.mjs`
- Build Go native shell parser: `node scripts/build-native-shell-parser.mjs`
- Build Go native tools: `node scripts/build-native-tools.mjs`

### Test
- Run single TypeScript unit test: `npx bun test src/utils/path.test.ts`
- Run all Bun TypeScript tests: `npx bun test`
- Run single Node test file: `node --test test/platform-support.test.mjs`
- Run all Node integration tests: `node --test test/*.test.mjs`

### Verification & Shrinkwrap
- Verify production shrinkwrap: `node release/production-shrinkwrap.mjs --check`
- Verify installation dependencies: `node scripts/verify-deps.mjs`

## Architecture

- **Entrypoints (`src/entrypoints/`)**: `cli.tsx` is the primary CLI entrypoint initializing the Ink terminal REPL (`src/replLauncher.tsx`, `src/commands.ts`).
- **Agent Loop & Query Engine (`src/QueryEngine.ts`, `src/query.ts`, `src/Tool.ts`)**: Manages model conversation context, system prompt composition, tool call execution, response streaming, and fallback recovery across providers.
- **Provider Adapters & Lanes (`src/lanes/`, `src/services/api/`)**: Implements native adapters for 22 LLM providers (OpenAI, Gemini, Kilo, Cursor, Anthropic, OpenRouter, etc.). Handles provider-specific wire formats, streaming, rate limits, and tool-schema sanitization without external CLI wrappers.
- **Tools & LSP (`src/tools/`, `src/services/`)**: Built-in agent tool implementations (`BashTool`, `WebSearchTool`, file tools) and native LSP client integration providing type checking and code navigation directly to the loop.
- **Native Helpers (`native/`)**: Go binaries (`shell-parser`, `tau-tools`) for high-performance shell parsing, fuzzy search, and syntax highlighting when Go 1.25+ is present.
- **Monorepo Packages**:
  - `packages/tau-installer`: Standalone package installer.
  - `editors/vscode` / `tau-vscode`: VS Code companion extension and IPC bridge.
