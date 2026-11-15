#!/usr/bin/env bash
# Enforces ADR-0001: accepted ADRs in docs/decision are append-only.
# Allowed: adding new NNNN-*.md files; changing ONLY the "- Status:" line of an existing ADR.
# Usage: tools/check-adr-append-only.sh [base-ref]   (default: origin/main)
set -euo pipefail

base="${1:-origin/main}"
dir="docs/decision"
fail=0

while IFS=$'\t' read -r status path _; do
  [[ "$path" =~ ^$dir/[0-9]{4}-.*\.md$ ]] || continue
  case "$status" in
    A) ;; # new ADR: fine
    D|R*) echo "ERROR: $path was deleted or renamed. ADRs are append-only; supersede instead."; fail=1 ;;
    M)
      changed=$(git diff -U0 "$base"...HEAD -- "$path" \
        | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' | grep -vE '^[+-]- Status: ' || true)
      if [[ -n "$changed" ]]; then
        echo "ERROR: $path changed beyond its Status line:"
        echo "$changed" | sed 's/^/    /'
        fail=1
      fi
      ;;
  esac
done < <(git diff --name-status "$base"...HEAD -- "$dir")

if [[ $fail -eq 1 ]]; then
  echo "To change a decision, add a new ADR that supersedes the old one (docs/decision/README.md)."
  exit 1
fi
echo "ADR append-only check passed."
