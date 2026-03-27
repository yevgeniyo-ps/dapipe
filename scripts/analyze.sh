#!/usr/bin/env bash
# scripts/analyze.sh — Analyse captured connection logs and compare against a
# baseline of allowed domains.  Emits GitHub annotations and a step summary.
set -euo pipefail

# ── Arguments / defaults ────────────────────────────────────────────────
LOG_DIR="${DAPIPE_LOG_DIR:-/tmp/dapipe}"
BASELINE="${1:-}"
MODE="${2:-monitor}"   # monitor | restrict
LOG_FILE="${LOG_DIR}/connections.jsonl"

echo "::group::DaPipe analysis"

# ── Sanity checks ───────────────────────────────────────────────────────
if [ ! -f "$LOG_FILE" ]; then
    echo "No connection log found at $LOG_FILE — nothing to analyse."
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
        echo "new-domains=" >> "$GITHUB_OUTPUT"
        echo "connection-count=0" >> "$GITHUB_OUTPUT"
    fi
    echo "::endgroup::"
    exit 0
fi

CONNECTION_COUNT=$(wc -l < "$LOG_FILE" | tr -d ' ')
echo "Total logged events: $CONNECTION_COUNT"

# ── Dump raw log ───────────────────────────────────────────────────────
echo ""
echo "::group::Raw connection log"
cat "$LOG_FILE"
echo "::endgroup::"
echo ""

# ── Extract blocked entries from log ─────────────────────────────────────
BLOCKED_DOMAINS=$(grep '"blocked"' "$LOG_FILE" \
    | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' \
    | sort -u \
    | grep -v '^$' || true)

BLOCKED_IPS=$(grep '"blocked"' "$LOG_FILE" \
    | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' \
    | sort -u \
    | grep -v '^$' || true)

BLOCKED_COUNT=0
if [ -n "$BLOCKED_DOMAINS" ]; then
    BLOCKED_COUNT=$(echo "$BLOCKED_DOMAINS" | wc -l | tr -d ' ')
    echo "Blocked domains ($BLOCKED_COUNT):"
    echo "$BLOCKED_DOMAINS" | sed 's/^/  ✗ /'
fi

BLOCKED_IP_COUNT=0
if [ -n "$BLOCKED_IPS" ]; then
    BLOCKED_IP_COUNT=$(echo "$BLOCKED_IPS" | wc -l | tr -d ' ')
    echo "Blocked IPs ($BLOCKED_IP_COUNT):"
    echo "$BLOCKED_IPS" | sed 's/^/  ✗ /'
fi

# ── Extract unique domains (skip empty strings) ────────────────────────
# Portable (no grep -P): use sed to extract domain values from JSON lines.
DOMAINS=$(sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' "$LOG_FILE" \
    | sort -u \
    | grep -v '^$' || true)

if [ -z "$DOMAINS" ]; then
    echo "No domains captured."
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
        echo "new-domains=" >> "$GITHUB_OUTPUT"
        echo "connection-count=$CONNECTION_COUNT" >> "$GITHUB_OUTPUT"
    fi
    echo "::endgroup::"
    exit 0
fi

echo "Unique domains observed:"
echo "$DOMAINS" | sed 's/^/  - /'

# ── Load baseline ──────────────────────────────────────────────────────
ALLOWED=""
if [ -n "$BASELINE" ] && [ -f "$BASELINE" ]; then
    # Extract allowed_domains array values (portable, no jq dependency).
    # Reads lines between [ and ], extracts quoted strings.
    ALLOWED=$(sed -n '/"allowed_domains"/,/]/p' "$BASELINE" \
        | sed -n 's/.*"\([^"]*\)".*/\1/p' \
        | grep -v 'allowed_domains' \
        | sort -u || true)
    echo "Baseline loaded from $BASELINE ($(echo "$ALLOWED" | wc -l | tr -d ' ') entries)"
else
    echo "No baseline file provided — all domains will be flagged."
fi

# ── Compare: find new (un-baselined) domains ───────────────────────────
NEW_DOMAINS=""
while IFS= read -r domain; do
    [ -z "$domain" ] && continue
    if [ -z "$ALLOWED" ] || ! echo "$ALLOWED" | grep -qxF "$domain"; then
        NEW_DOMAINS="${NEW_DOMAINS}${domain}"$'\n'
    fi
done <<< "$DOMAINS"
NEW_DOMAINS=$(echo "$NEW_DOMAINS" | sed '/^$/d' || true)

NEW_COUNT=0
if [ -n "$NEW_DOMAINS" ]; then
    NEW_COUNT=$(echo "$NEW_DOMAINS" | wc -l | tr -d ' ')
fi

# ── Emit GitHub annotations ────────────────────────────────────────────
if [ -n "$BLOCKED_DOMAINS" ]; then
    while IFS= read -r domain; do
        [ -z "$domain" ] && continue
        echo "::error::DaPipe: blocked outbound DNS for: $domain"
    done <<< "$BLOCKED_DOMAINS"
fi

if [ -n "$BLOCKED_IPS" ]; then
    while IFS= read -r ip; do
        [ -z "$ip" ] && continue
        echo "::error::DaPipe: blocked outbound connection to IP: $ip"
    done <<< "$BLOCKED_IPS"
fi

if [ -n "$NEW_DOMAINS" ]; then
    while IFS= read -r domain; do
        [ -z "$domain" ] && continue
        if [ "$MODE" = "restrict" ]; then
            echo "::error::DaPipe: unexpected outbound domain: $domain"
        else
            echo "::warning::DaPipe: unexpected outbound domain: $domain"
        fi
    done <<< "$NEW_DOMAINS"
fi

# ── Write step summary ─────────────────────────────────────────────────
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## DaPipe Connection Report"
        echo ""
        echo "| Metric | Value |"
        echo "|--------|-------|"
        echo "| Mode | \`$MODE\` |"
        echo "| Total events | $CONNECTION_COUNT |"
        echo "| Blocked | $BLOCKED_COUNT |"
        echo ""

        # In restrict mode, show one combined table: allowed vs blocked
        echo "### Connections"
        echo ""
        echo "| Domain | Status |"
        echo "|--------|--------|"

        # Show allowed (baselined) domains that connected successfully
        if [ -n "$ALLOWED" ]; then
            while IFS= read -r domain; do
                [ -z "$domain" ] && continue
                # Only show if it actually appeared in the log
                if echo "$DOMAINS" | grep -qxF "$domain"; then
                    echo "| \`$domain\` | :white_check_mark: allowed |"
                fi
            done <<< "$ALLOWED"
        fi

        # Show blocked domains
        if [ -n "$BLOCKED_DOMAINS" ]; then
            while IFS= read -r domain; do
                [ -z "$domain" ] && continue
                echo "| \`$domain\` | :no_entry: blocked |"
            done <<< "$BLOCKED_DOMAINS"
        fi

        # Show blocked IPs
        if [ -n "$BLOCKED_IPS" ]; then
            while IFS= read -r ip; do
                [ -z "$ip" ] && continue
                echo "| \`$ip\` | :no_entry: blocked (IP) |"
            done <<< "$BLOCKED_IPS"
        fi

        # In monitor mode, show new (un-baselined) domains that were NOT blocked
        if [ "$MODE" = "monitor" ] && [ -n "$NEW_DOMAINS" ]; then
            while IFS= read -r domain; do
                [ -z "$domain" ] && continue
                # Skip if already shown in blocked section
                if [ -n "$BLOCKED_DOMAINS" ] && echo "$BLOCKED_DOMAINS" | grep -qxF "$domain"; then
                    continue
                fi
                echo "| \`$domain\` | :warning: new |"
            done <<< "$NEW_DOMAINS"
        fi

        echo ""
    } >> "$GITHUB_STEP_SUMMARY"
    echo "Step summary written."
fi

# ── Upload report to SaaS ──────────────────────────────────────────────
if [ -n "${DAPIPE_API_KEY:-}" ]; then
    API_URL="${DAPIPE_API_URL:-https://dapipe.io}"
    REPO="${GITHUB_REPOSITORY:-unknown/unknown}"
    RUN_ID="${GITHUB_RUN_ID:-0}"
    RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${REPO}/actions/runs/${RUN_ID}"
    BRANCH="${GITHUB_REF_NAME:-}"
    COMMIT="${GITHUB_SHA:-}"

    echo "Uploading report to DaPipe SaaS ..."

    # Build connections JSON array from log file
    CONNECTIONS_JSON="["
    FIRST=true
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            CONNECTIONS_JSON="${CONNECTIONS_JSON},"
        fi
        CONNECTIONS_JSON="${CONNECTIONS_JSON}${line}"
    done < "$LOG_FILE"
    CONNECTIONS_JSON="${CONNECTIONS_JSON}]"

    REPORT_BODY=$(cat <<ENDJSON
{"repo":"${REPO}","run_id":"${RUN_ID}","run_url":"${RUN_URL}","branch":"${BRANCH}","commit_sha":"${COMMIT}","mode":"${MODE}","connections":${CONNECTIONS_JSON}}
ENDJSON
)

    UPLOAD_RESULT=$(curl -sf --max-time 15 \
        -X POST \
        -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$REPORT_BODY" \
        "$API_URL/api/v1/report" 2>/dev/null || true)

    if [ -n "$UPLOAD_RESULT" ]; then
        echo "Report uploaded to DaPipe SaaS."
    else
        echo "::warning::Failed to upload report to DaPipe SaaS — local report is still available."
    fi
fi

# ── Set outputs ─────────────────────────────────────────────────────────
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    # Comma-separated list of new domains
    NEW_DOMAINS_CSV=$(echo "$NEW_DOMAINS" | paste -sd ',' - || true)
    BLOCKED_DOMAINS_CSV=$(echo "$BLOCKED_DOMAINS" | paste -sd ',' - || true)
    BLOCKED_IPS_CSV=$(echo "$BLOCKED_IPS" | paste -sd ',' - || true)
    echo "new-domains=$NEW_DOMAINS_CSV" >> "$GITHUB_OUTPUT"
    echo "blocked-domains=$BLOCKED_DOMAINS_CSV" >> "$GITHUB_OUTPUT"
    echo "blocked-ips=$BLOCKED_IPS_CSV" >> "$GITHUB_OUTPUT"
    echo "blocked-count=$BLOCKED_COUNT" >> "$GITHUB_OUTPUT"
    echo "blocked-ip-count=$BLOCKED_IP_COUNT" >> "$GITHUB_OUTPUT"
    echo "connection-count=$CONNECTION_COUNT" >> "$GITHUB_OUTPUT"
fi

echo "::endgroup::"

# ── Exit code ───────────────────────────────────────────────────────────
if [ "$MODE" = "restrict" ] && [ "$NEW_COUNT" -gt 0 ]; then
    echo "DaPipe: $NEW_COUNT unexpected domain(s) detected in block mode — failing."
    exit 1
fi

echo "DaPipe analysis complete. $NEW_COUNT new domain(s) found."
exit 0
