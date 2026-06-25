# Claude Code Git Memory

Git-backed memory plugin for Zen / Claude Code compatible plugin runtimes.

The plugin stores memories as Markdown files in a small per-project Git repository. It has no Docker service, no vector database, and no embeddings dependency.

## Install From This Repository

Register this repository as a plugin marketplace:

```bash
zen plugin marketplace add https://github.com/AbdoKnbGit/Claude-Code-Git-Memory
zen plugin install zen-git-memory@claude-code-git-memory
```

Then restart Zen or run:

```text
/reload-plugins
```

## Use Locally During Development

From any real project:

```bash
zen --plugin-dir /path/to/Claude-Code-Git-Memory/zen-git-memory
```

## Commands

```text
/zen-git-memory:status
/zen-git-memory:remember --tag pinned preferences.coding.style Keep edits focused and follow existing project patterns.
/zen-git-memory:remember --tag fallback project.default.rules When unsure, inspect files before changing behavior.
/zen-git-memory:remember project.setup.commands Use npm test before committing.
/zen-git-memory:recall setup commands
/zen-git-memory:tree
```

## Storage

Default store:

```text
~/.zen/git-memory/<project-slug>
```

Override for testing:

```bash
TAU_GIT_MEMORY_STORE=/tmp/zen-git-memory-test zen --plugin-dir /path/to/zen-git-memory
```

## Context Injection

The plugin does not inject the entire memory repo every turn.

- On `SessionStart`, it injects store status and a compact list of memory paths.
- On every `UserPromptSubmit`, it always injects compact `pinned` snippets, then keyword-searches `normal` memories on the current project memory branch.
- If keyword search finds matches, it injects `pinned + keyword`.
- If keyword search finds no normal match, it injects `pinned + fallback`.
- Pinned and fallback memories are not searched for keyword injection because they belong to separate zones.
- There is no vector database, embedding cache, or background service. The Git-backed Markdown files are the cache/source of truth.

This keeps context small: Zen sees likely-relevant facts, then can use `/zen-git-memory:recall` or the script to fetch exact memory values when needed.
