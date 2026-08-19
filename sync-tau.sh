#!/usr/bin/env bash
set -euo pipefail

# Config
REPO_DIR="$HOME/f/tau"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="master"
FORK_REMOTE="origin"
MAIN_BRANCH="main"
BRANCHES=("master" "main")

cd "$REPO_DIR"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
MAIN_BEFORE=$(git rev-parse "$MAIN_BRANCH")

cleanup() {
  git checkout -q "$CURRENT_BRANCH" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Fetching $UPSTREAM_REMOTE/$UPSTREAM_BRANCH ==="
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

for BRANCH in "${BRANCHES[@]}"; do
  echo "=== Syncing branch: $BRANCH ==="
  git checkout -q "$BRANCH"

  if ! git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --ff-only 2>/dev/null; then
    echo "Diverged: attempting rebase..."

    STASHED=0
    if ! git diff --quiet || ! git diff --cached --quiet; then
      git stash push -q -m "sync-zen auto-stash $(date +%Y%m%d-%H%M%S)"
      STASHED=1
    fi

    git rebase --abort 2>/dev/null || true

    if ! git rebase -X ours --empty=drop "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
      echo "Rebase conflict: resolving..."
      COUNT=0
      while [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ]; do
        COUNT=$((COUNT + 1))
        if [ "$COUNT" -gt 50 ]; then
          echo "Rebase stuck: aborting."
          git rebase --abort 2>/dev/null || true
          break
        fi
        (git diff --name-only --diff-filter=U 2>/dev/null || true) | xargs -r git add 2>/dev/null || true
        (git diff --name-only --diff-filter=UD 2>/dev/null || true) | xargs -r git rm 2>/dev/null || true
        if ! GIT_EDITOR=true git rebase --continue 2>/dev/null; then
          git rebase --skip 2>/dev/null || true
        fi
      done
    fi

    [ "$STASHED" -eq 1 ] && (git stash pop -q 2>/dev/null || echo "Stash pop skipped: manual pop needed")
  fi

  git push -q "$FORK_REMOTE" "$BRANCH" --force-with-lease
done

MAIN_AFTER=$(git rev-parse "$MAIN_BRANCH")
if [ "$MAIN_BEFORE" != "$MAIN_AFTER" ]; then
  echo "Main branch ($MAIN_BRANCH) updated: rebuilding..."
  git checkout -q "$MAIN_BRANCH"
  npm run build
else
  echo "No new changes on main branch ($MAIN_BRANCH): skip build."
fi

echo "=== Done ==="
