# Tau Isolated Worktrees

Tau supports isolated Git worktrees through `tau --worktree <name>`. Each invocation creates a dedicated worktree under `.claude/worktrees/<name>` and a corresponding branch named `worktree-<name>`, with `/` in the name represented as `+` in the branch name.

```sh
tau --worktree feature/auth
```

For the example above:

- Worktree path: `.claude/worktrees/feature/auth`
- Branch: `worktree-feature+auth`

## Optional tmux Session

A worktree can be launched with a tmux session:

```sh
tau --worktree feature/auth --tmux
```

The `--tmux` option requires tmux and is not available on native Windows.

## Worktree Lifecycle

During a Tau session, an existing worktree can be entered with `EnterWorktree`. When leaving, choose one of the following actions:

- **keep**: retain the worktree and its branch.
- **remove**: delete both the worktree and branch. The worktree must be clean unless discarding changes is explicitly confirmed.

Tau does not automatically merge worktree changes back into the base branch.

## Naming and Inheritance

Worktree names may contain letters, digits, `.`, `_`, `-`, and `/`, with a maximum length of 64 characters. Path segments `.` and `..` are rejected.

Created worktrees inherit local settings, Git hooks, configured symlink directories, and files listed in `.worktreeinclude`.
