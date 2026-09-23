#!/usr/bin/env bash
# Docs quality gate: every relative Markdown link resolves, every Mermaid
# block is closed, every numbered doc in docs/ carries a "> Status:" line.
# Safe for file names with spaces. Exits non-zero on any failure.
set -u
fail=0
count=0
while IFS= read -r -d '' src; do
  count=$((count+1))
  dir=$(dirname "$src")
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in http*|\#*|mailto:*) continue ;; esac
    clean="${target%%#*}"
    [ -z "$clean" ] && continue
    decoded=$(printf '%b' "${clean//%/\\x}")
    if [ ! -e "$dir/$clean" ] && [ ! -e "$dir/$decoded" ]; then
      echo "broken link: $src -> $target"; fail=1
    fi
  done < <(grep -oE '\]\([^) ]+\)' "$src" | sed -E 's/^\]\(//; s/\)$//')
  opens=$(grep -c '^```mermaid' "$src" || true)
  if [ "${opens:-0}" -gt 0 ]; then
    closes=$(awk '/^```mermaid/{c=1;next} /^```[[:space:]]*$/{if(c){n++;c=0}} END{print n+0}' "$src")
    if [ "$opens" -ne "$closes" ]; then echo "unbalanced mermaid: $src"; fail=1; fi
  fi
done < <(find . -name '*.md' -not -path './.git/*' -not -path '*/node_modules/*' -print0)
for f in docs/[0-9]*.md; do
  [ -e "$f" ] || continue
  grep -qE '^> Status:' "$f" || { echo "missing '> Status:' line: $f"; fail=1; }
done
if [ $fail -eq 0 ]; then echo "docs OK ($count markdown files)"; else echo "docs check FAILED"; fi
exit $fail
