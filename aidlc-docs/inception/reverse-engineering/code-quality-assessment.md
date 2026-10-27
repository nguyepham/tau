# Code Quality Assessment

## Test Coverage
- **Overall**: Fair to Good on critical paths (437 test files across unit and integration suites against 2,800 TypeScript source files; no automated coverage-percentage gate configured in `package.json`).
- **Unit Tests**: 271 co-located test files (`src/**/*.test.ts`, `src/**/*.test.tsx`) focusing heavily on provider lanes (`src/lanes/openai-compat/`, `src/lanes/gemini/`, `src/lanes/codex/`, `src/lanes/cline/`), caching/usage accounting, prompt compaction, terminal Ink rendering, and slash commands.
- **Integration Tests**: 166 test files under `test/` plus package-level tests (`packages/tau-installer/test/installer.test.mjs`, `native/tau-voice/test/addon.test.mjs`) validating end-to-end tool roundtrips, auth port ownership, voice binary packaging, shrinkwrap integrity, and MCP instructions.

## Code Quality Indicators
- **Linting & Static Analysis**:
  - `tsconfig.json` enforces `"strict": true` and `"forceConsistentCasingInFileNames": true` (with `"skipLibCheck": true`).
  - Inline ESLint directives (`/* eslint-disable ... */`) appear in source files, though no standalone ESLint/Biome config file or `"lint"` npm script is present at the repository root.
  - Release gates (`npm run prepublishOnly`) enforce shrinkwrap consistency, installer publication checks, native voice binary checks, and full bundle compilation.
- **Code Style**: Consistent TypeScript ESM idioms (`import type`, explicit `.js` relative specifiers resolved by `esbuild`/Bun, `zod` schema definitions, functional React hooks).
- **Documentation**: Good — thorough user-facing documentation in `README.md`, `PROVIDERS.md`, `COMMANDS.md`, `CHANGELOG.md`, `plugins/README.md`, and `native/tau-voice/README.md`, complemented by detailed architectural JSDoc headers in core contracts (`src/lanes/types.ts`, `src/Tool.ts`, `build.mjs`).

## Technical Debt
- **Dual Test Runner Split**: Test files are split between `node:test` (147 files) and `bun:test` (44 files), and root `package.json` only wires narrow test scripts (`test:voice`, `test:auth`, `test:voice-packages`) rather than a single unified `npm test` command running all 437 test files.
- **Very Large Monolithic Modules**: 33 TypeScript files under `src/` exceed 2,000 lines, led by `src/utils/messages.ts` (5,835 lines), `src/cli/print.ts` (5,650 lines), `src/utils/hooks.ts` (5,544 lines), `src/utils/sessionStorage.ts` (5,340 lines), `src/screens/REPL.tsx` (5,316 lines), `src/main.tsx` (4,792 lines), `src/utils/bash/bashParser.ts` (4,436 lines), `src/lanes/openai-compat/loop.ts` (4,340 lines), and `src/services/api/claude.ts` (4,250 lines).
- **Build-Time Regex Post-Processing & Shimming**: `build.mjs` applies regex-based CJS-to-ESM import rewrites (`cjsPackages` set), strips internal guards (`!configReadingAllowed`, `assertMinVersion`), and falls back missing internal imports to `dist/shim.js` (`Proxy` no-op default export), which can mask unresolved dead imports if not covered by `tsc` or runtime tests.
- **Dual Provider Abstractions During Migration**: `src/lanes/types.ts` supports both full lane-owned loops (`lane.run()`) and per-turn provider shims (`lane.streamAsProvider()` alongside `src/services/api/providers/BaseProvider`), requiring shared helper coordination across `src/lanes/` and `src/services/api/providers/`.
- **Two Separate VS Code Extensions in Repo**: Both `editors/vscode/` (ACP webview chat, v0.1.0) and `tau-vscode/` (IDE terminal companion, v0.6.0) carry `"name": "tau-vscode"`, risking confusion without clear boundary documentation.
- **Tracked `TODO`/`FIXME` Markers**: 154 `TODO`/`FIXME` occurrences across `src/` (low density relative to ~780k LOC, but concentrated in complex utility and lane modules).

## Patterns and Anti-patterns
- **Good Patterns**:
  - **Fail-Closed Tool Defaults (`src/Tool.ts:793-825`)**: `buildTool()` defaults `isConcurrencySafe`, `isReadOnly`, and `isDestructive` to `false`, preventing accidental parallel writes or unguarded execution.
  - **Constant-Time Auth & Fragment Token Isolation (`src/services/remote/server.ts:31-36, 73-80`)**: Remote web shell keeps tokens in URL `#fragment` out of HTTP logs and verifies WebSocket/image tokens via `crypto.timingSafeEqual`.
  - **Self-Healing Startup Preflight (`build.mjs:365-496`, `scripts/verify-deps.mjs`)**: Detects npm-blocked postinstall scripts or incompatible Node runtimes before importing the main bundle.
  - **Normalized Streaming IR (`src/lanes/types.ts`)**: Keeps UI, compaction, and tool execution decoupled from 30 distinct provider wire formats.
- **Anti-patterns**:
  - **God Files (>4,000 LOC)** in `src/screens/REPL.tsx`, `src/utils/messages.ts`, `src/cli/print.ts`, and `src/utils/hooks.ts` mixing orchestration, state transitions, and formatting logic.
  - **Silent Wildcard Shim Fallback (`build.mjs:238-242`)**: Missing repo-local files resolve to `dist/shim.js` at bundle time rather than failing the build unless caught separately by TypeScript checking.
