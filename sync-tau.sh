#!/usr/bin/env bash
# set -euo pipefail: Exit immediately on error, unset variables, or pipe failures
set -euo pipefail

# Config
REPO_DIR="$HOME/harness/tau"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="master"
FORK_REMOTE="origin"
MAIN_BRANCH="compress-system-prompt-new"
BRANCHES=("master" "compress-system-prompt" "compress-system-prompt-new")

# cd: Change directory to repo root
cd "$REPO_DIR"

echo "=== Fetching $UPSTREAM_REMOTE/$UPSTREAM_BRANCH ==="
# git fetch: Downloads commits, refs, and files from upstream master without modifying local working directory
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

# git rev-parse --abbrev-ref HEAD: Returns short name of active branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
# git rev-parse: Resolves branch reference to its full 40-character commit hash
MAIN_BEFORE=$(git rev-parse "$MAIN_BRANCH")

for BRANCH in "${BRANCHES[@]}"; do
  echo "=== Syncing branch: $BRANCH ==="
  # git checkout -q: Switches working tree to target branch silently
  git checkout -q "$BRANCH"

  # git merge --ff-only: Fast-forwards current branch to match upstream commit if local has no unique commits
  if ! git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --ff-only 2>/dev/null; then
    echo "Diverged: attempting rebase..."

    STASHED=0
    # git diff --quiet / --cached --quiet: Checks for uncommitted working tree changes and staged index changes
    if ! git diff --quiet || ! git diff --cached --quiet; then
      # git stash push -q -m: Saves uncommitted working directory changes into stash stack with message string silently
      git stash push -q -m "sync-zen auto-stash $(date +%Y%m%d-%H%M%S)"
      STASHED=1
    fi

    # git rebase --abort: Cancels leftover rebase operation from prior failed run and restores branch state
    git rebase --abort 2>/dev/null || true

    # git rebase -X ours: Replays local commits on top of upstream master, resolving content conflicts in favor of local version
    if ! git rebase -X ours "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
      echo "Rebase conflict: resolving..."
      while [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ]; do
        # git diff --name-only --diff-filter=U | xargs -r git add: Lists unmerged conflict files and stages them as resolved
        git diff --name-only --diff-filter=U 2>/dev/null | xargs -r git add
        # git diff --name-only --diff-filter=UD | xargs -r git rm: Lists modify/delete conflicts and stages deletion
        git diff --name-only --diff-filter=UD 2>/dev/null | xargs -r git rm 2>/dev/null || true
        # GIT_EDITOR=true git rebase --continue: Resumes paused rebase without editor prompt
        GIT_EDITOR=true git rebase --continue 2>/dev/null || true
      done
    fi

    # git stash pop -q: Applies latest stashed changes back onto working directory silently
    [ "$STASHED" -eq 1 ] && (git stash pop -q 2>/dev/null || echo "Stash pop skipped: manual pop needed")
  fi

  # git push -q --force-with-lease: Pushes updated branch to origin remote silently, overwriting remote branch safely
  git push -q "$FORK_REMOTE" "$BRANCH" --force-with-lease
done

# git checkout -q: Return to initial active branch
git checkout -q "$CURRENT_BRANCH"

MAIN_AFTER=$(git rev-parse "$MAIN_BRANCH")
if [ "$MAIN_BEFORE" != "$MAIN_AFTER" ]; then
  echo "Main branch ($MAIN_BRANCH) updated: rebuilding..."
  git checkout -q "$MAIN_BRANCH"
  npm run build
  git checkout -q "$CURRENT_BRANCH"
else
  echo "No new changes on main branch ($MAIN_BRANCH): skip build."
fi

echo "=== Done ==="
