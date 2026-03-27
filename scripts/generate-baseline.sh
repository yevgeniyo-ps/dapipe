#!/usr/bin/env bash
# scripts/generate-baseline.sh — Generate a baseline.json from an existing
# connections.jsonl log.  Run this after a "known good" CI run to create the
# allowed-domains list.
set -euo pipefail

LOG_FILE="${1:-${DAPIPE_LOG_DIR:-/tmp/dapipe}/connections.jsonl}"
OUTPUT="${2:-.dapipe/baseline.json}"

if [ ! -f "$LOG_FILE" ]; then
    echo "Error: log file not found: $LOG_FILE" >&2
    exit 1
fi

# Extract unique non-empty domains (portable, no grep -P)
DOMAINS=$(sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' "$LOG_FILE" \
    | sort -u \
    | grep -v '^$' || true)

if [ -z "$DOMAINS" ]; then
    echo "No domains found in $LOG_FILE" >&2
    exit 1
fi

# Build JSON
mkdir -p "$(dirname "$OUTPUT")"
{
    echo '{'
    echo '  "version": 1,'
    echo '  "allowed_domains": ['

    FIRST=true
    while IFS= read -r domain; do
        [ -z "$domain" ] && continue
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            echo ','
        fi
        printf '    "%s"' "$domain"
    done <<< "$DOMAINS"

    echo ''
    echo '  ]'
    echo '}'
} > "$OUTPUT"

echo "Baseline written to $OUTPUT with $(echo "$DOMAINS" | wc -l | tr -d ' ') domain(s)."
