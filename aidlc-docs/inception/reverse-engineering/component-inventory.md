# Component Inventory

## Application Packages
- `@abdoknbgit/tau` (`package.json`, `src/`) - Primary multi-provider AI coding CLI, custom React/Ink terminal UI, native provider lanes, 50+ developer tools, MCP client/server, ACP server, and remote session server.
- `@abdoknbgit/tau-installer` (`packages/tau-installer/package.json`) - Standalone `npx` installer CLI that installs `@abdoknbgit/tau` globally with reviewed lifecycle scripts scoped only to that installation.
- `tau-vscode` ACP Extension (`editors/vscode/package.json`) - VS Code sidebar webview chat extension communicating with `tau acp` over stdio JSON-RPC.
- `tau-vscode` Companion Extension (`tau-vscode/package.json`) - VS Code companion extension providing terminal launch commands, active editor selection context, diagnostics, and inline diff integration.

## Infrastructure Packages
- `release` & `scripts` Build/Distribution Pipeline (`build.mjs`, `build.ts`, `release/*`, `scripts/*`) - Build bundling, `npm-shrinkwrap.json` generation/verification, native binary compilation, and runtime dependency self-repair (`verify-deps.mjs`).
- `@abdoknbgit/tau-voice-linux-x64` (`platform-packages/tau-voice-linux-x64/package.json`) - Platform-specific npm distribution package for Linux x64 native voice binary.
- `@abdoknbgit/tau-voice-linux-arm64` (`platform-packages/tau-voice-linux-arm64/package.json`) - Platform-specific npm distribution package for Linux arm64 native voice binary.
- `@abdoknbgit/tau-voice-darwin-x64` (`platform-packages/tau-voice-darwin-x64/package.json`) - Platform-specific npm distribution package for macOS x64 native voice binary.
- `@abdoknbgit/tau-voice-darwin-arm64` (`platform-packages/tau-voice-darwin-arm64/package.json`) - Platform-specific npm distribution package for macOS arm64 native voice binary.
- `@abdoknbgit/tau-voice-win32-x64` (`platform-packages/tau-voice-win32-x64/package.json`) - Platform-specific npm distribution package for Windows x64 native voice binary.
- `@abdoknbgit/tau-voice-win32-arm64` (`platform-packages/tau-voice-win32-arm64/package.json`) - Platform-specific npm distribution package for Windows arm64 native voice binary.

## Shared Packages
- `github.com/abdoknbgit/tau/native/shell-parser` (`native/shell-parser/go.mod`) - Native Go utility parsing POSIX/Bash commands via `mvdan.cc/sh/v3` for AST-based security classification.
- `github.com/abdoknbgit/tau/native/tau-tools` (`native/tau-tools/go.mod`) - Native Go CLI helper providing fuzzy search, syntax highlighting, terminal markdown rendering, TUI pickers, git status summaries, and system info.
- `tau-voice` (`native/tau-voice/Cargo.toml`) - Rust N-API (`cdylib`) Node.js addon exposing async native voice and WebRTC session bindings.
- `pi-voice` (`native/tau-voice/engine/Cargo.toml`) - Rust core audio capture/playback (CoreAudio, WASAPI, Linux), Opus codec, and WebRTC engine library consumed by `tau-voice`.
- `tau-git-memory` (`plugins/tau-git-memory/.claude-plugin/plugin.json`) - Bundled plugin providing branch-aware Git-backed session memory commands, skills, and hooks.

## Test Packages
- Workspace Unit & Integration Test Suite (`test/*` with 170 files + co-located `src/**/*.test.ts(x)` with 271 files) - Node (`node:test`) and Bun (`bun:test`) suites covering provider lanes, schemas, caching, auth, voice packaging, installer, and UI components.
- `mcp-instructions` Fixture Package (`test/mcp-instructions/package.json`) - Standalone MCP test server fixture validating MCP initialization instructions and tool discovery behavior.

## Total Count
- **Total Packages**: 18
- **Application**: 4
- **Infrastructure**: 7
- **Shared**: 5
- **Test**: 2
