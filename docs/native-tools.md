# Optional Native Zen Helpers

Zen bundles `dist/native/zen-tools[.exe]` as optional helper plumbing. The
bundle is resolved relative to Zen's installed package, so it is portable across
machines and not hardcoded to one local path.

Generated Markdown, Markdown tables, and code blocks are UI rendering concerns,
not agent tools. Zen's normal Markdown and code-block renderers call the native
helper underneath when available:

- `render-markdown` uses Charm Glamour with Zen's compact style for Markdown
  and table rendering.
- `highlight-code` uses Chroma for broad language syntax highlighting.

If the helper is unavailable, Zen falls back to the existing TypeScript renderer
instead of breaking the session.

The helper is built by `npm run build` and `npm run build:native-tools`.
During npm install, `postinstall` also tries to build it when Go is available.
Current helper dependencies require Go 1.25.8 or newer when building from
source.

Published packages include the prebuilt helper under `dist/native`. Source
installs can rebuild it with Go, or skip it without breaking Zen.

Bubble Tea `pick` remains manual because it is interactive, not a safe automatic
agent call.

## Commands

```bash
dist/native/zen-tools highlight-code --in src/main.tsx --lang tsx
dist/native/zen-tools git-summary --repo . --pretty
dist/native/zen-tools sysinfo --pretty
dist/native/zen-tools fuzzy-rank --query model --in models.txt
dist/native/zen-tools pick --title "Model" --in models.txt
dist/native/zen-tools render-markdown --in README.md --style zen-compact-dark
```

## Included

- Bubble Tea, Bubbles, Lip Gloss: standalone manual picker only.
- go-git: exposed as the read-only `NativeGitSummary` agent tool.
- gopsutil: exposed as the read-only `NativeSysInfo` agent tool.
- Fuzzy matching: helper command only.
- Chroma code highlighting and Charm Glamour Markdown rendering: helper
  commands used implicitly by Zen rendering.

`NativeRenderMarkdown` and `NativeHighlightCode` are deliberately not exposed as
agent tools. Normal generated code and requests like "make a summary Markdown
table" stay as regular Zen UI-rendered answers.

## Deliberately Avoided

- Gum: useful for scripts, but not a Zen runtime dependency.
- fzf: useful when already installed, but not required by Zen.
- Cobra and Viper: useful for large Go CLIs, but unnecessary for this helper.

To make a missing Go toolchain fail CI instead of skipping the helper, set:

```bash
TAU_REQUIRE_NATIVE_TOOLS=1 npm run build:native-tools
```
