#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-master}"
FORK_REMOTE="${FORK_REMOTE:-origin}"

echo "==> Fetching ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}..."
git fetch "${UPSTREAM_REMOTE}" "${UPSTREAM_BRANCH}"

# Sort local branches by topological commit depth (root-first linear order)
SORTED_BRANCHES=($(git for-each-ref --format='%(refname:short)' refs/heads/ | while read -r branch; do
  echo "$(git rev-list --count "${branch}") ${branch}"
done | sort -n | awk '{print $2}'))

PREV_TARGET="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
for BRANCH in "${SORTED_BRANCHES[@]}"; do
  echo "==> Rebasing ${BRANCH} onto ${PREV_TARGET}..."
  git rebase "${PREV_TARGET}" "${BRANCH}"
  PREV_TARGET="${BRANCH}"
done

# echo "==> Pushing updated branches to ${FORK_REMOTE}..."
# git push "${FORK_REMOTE}" "${SORTED_BRANCHES[@]}" --force-with-lease

echo "==> Linear sync complete."
