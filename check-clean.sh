#!/usr/bin/env bash
# Fails if any file mentions a word on a private list (one word per line).
# The list is kept OUTSIDE this folder so it can never be published:
#   $PRIVATE_WORDS_FILE, or ~/.config/awesome-ui/private-words by default.
set -euo pipefail
cd "$(dirname "$0")"
list="${PRIVATE_WORDS_FILE:-$HOME/.config/awesome-ui/private-words}"
[ -f "$list" ] || { echo "no private word list at $list — nothing to check"; exit 0; }
hits=$(grep -rniwF -f "$list" --exclude=check-clean.sh --exclude-dir=.git . || true)
if [ -n "$hits" ]; then echo "$hits"; echo "✕ private words found"; exit 1; fi
echo "✓ clean"
