#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-master}"
FORK_REMOTE="${FORK_REMOTE:-origin}"

echo "==> Fetching ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}..."
git fetch "${UPSTREAM_REMOTE}" "${UPSTREAM_BRANCH}"

TARGET="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"

LOCAL_BRANCHES=($(git for-each-ref --format='%(refname:short)' refs/heads/))

# Find roots: local branches directly branching off TARGET
for BRANCH in "${LOCAL_BRANCHES[@]}"; do
  BASE=$(git merge-base "${TARGET}" "${BRANCH}")

  # Check if another local branch is an intermediate ancestor
  HAS_LOCAL_PARENT=false
  for OTHER in "${LOCAL_BRANCHES[@]}"; do
    [[ "${OTHER}" == "${BRANCH}" ]] && continue
    if git merge-base --is-ancestor "${BASE}" "${OTHER}" 2>/dev/null && \
       git merge-base --is-ancestor "${OTHER}" "${BRANCH}" 2>/dev/null; then
      HAS_LOCAL_PARENT=true
      break
    fi
  done

  # Rebase root branch + cascade updates down local branch tree
  if [[ "${HAS_LOCAL_PARENT}" == false ]]; then
    echo "==> Rebasing tree root ${BRANCH} onto ${TARGET} (with --update-refs)..."
    if ! git rebase -X ours --empty=drop --update-refs "${TARGET}" "${BRANCH}"; then
      echo "==> Resolving conflicts on ${BRANCH}..."
      COUNT=0
      while [[ -d ".git/rebase-merge" || -d ".git/rebase-apply" ]]; do
        ((COUNT++))
        if [[ "${COUNT}" -gt 50 ]]; then
          echo "==> Rebase stuck on ${BRANCH}: aborting."
          git rebase --abort 2>/dev/null || true
          break
        fi
        git diff --name-only --diff-filter=U 2>/dev/null | xargs -r git add 2>/dev/null || true
        git diff --name-only --diff-filter=UD 2>/dev/null | xargs -r git rm 2>/dev/null || true
        GIT_EDITOR=true git rebase --continue 2>/dev/null || git rebase --skip 2>/dev/null || true
      done
    fi
  fi
done

# echo "==> Pushing updated branches to ${FORK_REMOTE}..."
# git push "${FORK_REMOTE}" "${LOCAL_BRANCHES[@]}" --force-with-lease

echo "==> General sync complete."
