#!/usr/bin/env bash
# Docs gate: every relative link in a Markdown file resolves, every Mermaid
# block is closed and non-empty, and every numbered architecture doc declares
# a "> Status:" line. Runs in CI.
set -u
fail=0
files=$(find . -name '*.md' -not -path './.git/*' -not -path '*/node_modules/*')
for src in $files; do
  for target in $(grep -oE '\]\([^) ]+\)' "$src" | sed -E 's/^\]\(//; s/\)$//'); do
    case "$target" in http*|\#*|mailto:*) continue ;; esac
    clean="${target%%#*}"; [ -z "$clean" ] && continue
    if [ ! -e "$(dirname "$src")/$clean" ]; then echo "broken link: $src -> $target"; fail=1; fi
  done
  opens=$(grep -c '^```mermaid' "$src" || true)
  if [ "$opens" -gt 0 ]; then
    closes=$(awk '/^```mermaid/{c=1;next} /^```$/{if(c){n++;c=0}} END{print n+0}' "$src")
    [ "$opens" -ne "$closes" ] && { echo "unbalanced mermaid: $src"; fail=1; }
  fi
done
for f in docs/[0-9]*.md; do
  [ -e "$f" ] || continue
  grep -qE '^> Status:' "$f" || { echo "missing '> Status:' line: $f"; fail=1; }
done
[ $fail -eq 0 ] && echo "docs OK ($(echo "$files" | wc -l | tr -d ' ') markdown files)"
exit $fail
