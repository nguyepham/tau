# Technology Stack

## Programming Languages
- **TypeScript** - `^5.7.3` (`tsconfig.json`, `package.json`) - Primary implementation language across `src/` (2,212 `.ts` and 595 `.tsx` files) and `editors/vscode/src/`.
- **JavaScript (ESM / Node MJS)** - Node.js `>=20.19.0 <21.0.0 || >=22.12.0` (`package.json`) - Build scripts (`build.mjs`, `scripts/*.mjs`, `release/*.mjs`), installer (`packages/tau-installer`), companion VS Code extension (`tau-vscode`), plugin scripts, and `node:test` suites (195 `.mjs` and 33 `.js` files).
- **Go** - `1.23` (`native/shell-parser/go.mod`) & `1.25.8` (`native/tau-tools/go.mod`) - Compiled native helper binaries for POSIX/Bash AST parsing and terminal search/render/git/sysinfo acceleration (8 `.go` files).
- **Rust** - Edition `2024` (`native/tau-voice/Cargo.toml`, `native/tau-voice/engine/Cargo.toml`) - Native N-API `cdylib` audio capture/playback, Opus codec, and WebRTC voice engine (12 `.rs` files).

## Frameworks and Core Runtimes
- **React & Custom Ink Terminal Reconciler** - `react ~19.1.0` + `react-reconciler ~0.32.0` + `src/ink/` - Declarative terminal UI framework supporting Flexbox layout, ANSI styling, Sixel graphics, and terminal Mermaid rendering.
- **Commander.js** - `commander ~12.1.0` + `@commander-js/extra-typings ^12.1.0` - Strongly typed CLI flag and subcommand parsing (`src/main.tsx`).
- **Model Context Protocol (MCP) SDK** - `@modelcontextprotocol/sdk ^1.12.1` - Tool, prompt, and resource server/client integration (`src/services/mcp/`).
- **Agent Client Protocol (ACP) SDK** - `@agentclientprotocol/sdk ^0.26.0` - Stdio JSON-RPC agent server for code editors (`src/acp/`).
- **Zod & Ajv** - `zod ^3.25.0`, `ajv ^8.17.1` - Runtime schema validation and JSON Schema generation for tools, configs, and provider payloads.
- **Tokio & N-API RS** - `tokio =1.53.1`, `napi =3.12.2` - Async Rust runtime and Node.js native addon bindings (`native/tau-voice`).
- **Charmbracelet TUI Suite** - `bubbletea/v2`, `bubbles/v2`, `glamour/v2`, `lipgloss/v2` - Native Go interactive pickers and markdown rendering (`native/tau-tools`).

## Infrastructure and Runtime Services
- **Local Node.js / Bun CLI Runtime** - Executes the bundled `dist/tau.mjs` agent via the self-healing `dist/cli.mjs` preflight launcher.
- **Chromium via Chrome DevTools Protocol (CDP)** - Local browser automation, DOM observation, layout measurement, and network/console inspection (`src/services/browser/`).
- **Persistent Python Kernel** - Stateful subprocess kernel bridged back to Tau tools for context-free data/code computation (`src/tools/EvalTool/`).
- **Language Server Protocol (LSP) Processes** - Optional background language diagnostics via `pyright`, `@vtsls/language-server`, `bash-language-server`, `yaml-language-server`, and `vscode-langservers-extracted` (`src/services/lsp/`).
- **Cloudflare Quick Tunnel (`cloudflared`) & Local WebSocket Server** - LAN (`0.0.0.0:7777`) and global HTTPS remote session control (`src/services/remote/`).
- **OpenTelemetry** - `@opentelemetry/api ^1.9.0` & SDK `^2.0.0` / `^0.200.0` - Structured tracing, metrics, and log instrumentation.
- **E2B Cloud Sandbox** - `e2b ^2.10.0` - Optional remote code execution sandbox integration.

## Build Tools
- **esbuild** - `^0.28.0` - Primary Node-native TypeScript/TSX bundler (`build.mjs`, `editors/vscode/esbuild.mjs`).
- **Bun** - `@types/bun ^1.2.10` / `build.ts` - Optional alternative bundler and fast dev/test runtime (`bun run build:bun`).
- **TypeScript Compiler (`tsc`)** - `^5.7.3` - Static type checking (`strict: true`).
- **Go Toolchain** - `go build` orchestrated via `scripts/build-native-shell-parser.mjs` and `scripts/build-native-tools.mjs`.
- **Cargo & napi-build** - `napi-build =2.4.1` + `cmake` (`native/tau-voice/cmake/voice.cmake`) orchestrated via `scripts/build-native-voice.mjs`.
- **npm Shrinkwrap Pipeline** - `release/production-shrinkwrap.mjs` - Generates and validates deterministic `npm-shrinkwrap.json` for published tarballs.

## Testing Tools
- **Node.js Built-in Test Runner (`node:test` + `node:assert/strict`)** - Used in 147 test files across `test/*.test.mjs`, `packages/tau-installer/test/`, `native/tau-voice/test/`, and `src/`.
- **Bun Test Runner (`bun:test`)** - Used in 44 co-located TypeScript unit tests under `src/**/*.test.ts(x)`.
- **Smoke & Release Verification Scripts** - `scripts/smoke_command_help.mjs`, `scripts/test-voice.mjs`, `release/verify-native-voice.mjs`, and `release/verify-installer-published.mjs`.
