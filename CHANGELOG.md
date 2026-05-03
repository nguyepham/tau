# Changelog

## [Unreleased]

## [v0.6.3] - 2026-05-03

### Added
- New `/github` command suite: issue creation with safe permissions, wrap-to-commit/push, and release publish flow.
- Allow `/github release` to inspect workflow runs via `gh run list`.

### Changed
- Refined `/github wrap` prompt with strict writing style and clearer task phases.
- Updated `/github wrap` safety protocol and authorization rules.

### Fixed
- `/github release` version input no longer auto-submits on every keystroke; partial semver now stops and asks for a full tag.

## 0.6.2

### Added
- Session report command (`/report`) for generating detailed session summaries.
- Session statistics command (`/stats`) to track usage and performance.
- Navigation commands: `/tree`, `/clone`, and `/import` for enhanced session management.
- Improved branch naming: auto-named branches now use a `last-prompt` seed and `HH:MM` timestamp for better uniqueness.

### Fixed
- Resolved "garbage" names for branches, clones, and imports when launched via slash commands.
- Fixed Tau CI workflow and Kilo cache build issues.

### Changed
- Refined README with centered logo and updated branding assets.

## 0.6.0 - Claudex to Tau migration

- Renamed the product surface from Claudex to Tau across the CLI, docs, terminal UI, and VS Code companion.
- Added the `tau` command and changed install/update flows to use `@abdoknbgit/tau`.
- Kept legacy `claudex` command/config compatibility where needed so existing users are not stranded.
- Reworked the startup logo/theme around the Tau math-symbol identity with the darker red, brown, and black terminal style.
- Renamed the VS Code companion workspace to `tau-vscode` and updated launch defaults to run `tau`.
- Updated provider notes and documented scalable context handling plus fallback recovery.
