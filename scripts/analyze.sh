#!/usr/bin/env bash
# scripts/analyze.sh — Analyse captured connection logs and report results.
set -euo pipefail

SETUP_START="${DAPIPE_SETUP_START:-}"
LOG_DIR="${DAPIPE_LOG_DIR:-/tmp/dapipe}"
BASELINE="${1:-}"
MODE="${2:-monitor}"
LOG_FILE="${LOG_DIR}/connections.jsonl"

echo "::group::DaPipe analysis"

# ── Sanity checks ────────────────────────────────────────────────────
if [ ! -f "$LOG_FILE" ]; then
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
        echo "new-domains=" >> "$GITHUB_OUTPUT"
        echo "connection-count=0" >> "$GITHUB_OUTPUT"
    fi
    echo "::endgroup::"
    echo "DaPipe: no connections captured."
    exit 0
fi

CONNECTION_COUNT=$(wc -l < "$LOG_FILE" | tr -d ' ')

# ── Extract blocked entries ──────────────────────────────────────────
BLOCKED_DOMAINS=$(grep '"blocked"' "$LOG_FILE" \
    | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' \
    | sort -u \
    | grep -v '^$' || true)

BLOCKED_IPS=$(grep '"blocked"' "$LOG_FILE" \
    | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' \
    | sort -u \
    | grep -v '^$' || true)

BLOCKED_COUNT=0
[ -n "$BLOCKED_DOMAINS" ] && BLOCKED_COUNT=$(echo "$BLOCKED_DOMAINS" | wc -l | tr -d ' ')
BLOCKED_IP_COUNT=0
[ -n "$BLOCKED_IPS" ] && BLOCKED_IP_COUNT=$(echo "$BLOCKED_IPS" | wc -l | tr -d ' ')

# ── Extract unique domains ──────────────────────────────────────────
DOMAINS=$(sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' "$LOG_FILE" \
    | sort -u \
    | grep -v '^$' || true)

if [ -z "$DOMAINS" ]; then
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
        echo "new-domains=" >> "$GITHUB_OUTPUT"
        echo "connection-count=$CONNECTION_COUNT" >> "$GITHUB_OUTPUT"
    fi
    echo "::endgroup::"
    echo "DaPipe: no domains captured."
    exit 0
fi

# ── Load baseline ────────────────────────────────────────────────────
ALLOWED=""
if [ -n "$BASELINE" ] && [ -f "$BASELINE" ]; then
    ALLOWED=$(sed -n '/"allowed_domains"/,/]/p' "$BASELINE" \
        | sed -n 's/.*"\([^"]*\)".*/\1/p' \
        | grep -v 'allowed_domains' \
        | sort -u || true)
fi

# ── Compare: find new (un-baselined) domains ────────────────────────
NEW_DOMAINS=""
while IFS= read -r domain; do
    [ -z "$domain" ] && continue
    if [ -z "$ALLOWED" ] || ! echo "$ALLOWED" | grep -qxF "$domain"; then
        NEW_DOMAINS="${NEW_DOMAINS}${domain}"$'\n'
    fi
done <<< "$DOMAINS"
NEW_DOMAINS=$(echo "$NEW_DOMAINS" | sed '/^$/d' || true)

NEW_COUNT=0
[ -n "$NEW_DOMAINS" ] && NEW_COUNT=$(echo "$NEW_DOMAINS" | wc -l | tr -d ' ')

# ── GitHub annotations (only for blocked/new) ───────────────────────
if [ -n "$BLOCKED_DOMAINS" ]; then
    while IFS= read -r domain; do
        [ -z "$domain" ] && continue
        echo "::error::DaPipe: blocked connection to $domain"
    done <<< "$BLOCKED_DOMAINS"
fi

if [ -n "$BLOCKED_IPS" ]; then
    while IFS= read -r ip; do
        [ -z "$ip" ] && continue
        echo "::error::DaPipe: blocked connection to IP $ip"
    done <<< "$BLOCKED_IPS"
fi

# ── Compute timing ──────────────────────────────────────────────────
DURATION_TEXT=""
if [ -n "$SETUP_START" ]; then
    NOW=$(date +%s)
    ELAPSED=$((NOW - SETUP_START))
    if [ "$ELAPSED" -ge 60 ]; then
        DURATION_TEXT="$((ELAPSED / 60))m $((ELAPSED % 60))s"
    else
        DURATION_TEXT="${ELAPSED}s"
    fi
fi

# ── Step summary ─────────────────────────────────────────────────────
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## DaPipe Connection Report"
        echo ""
        echo "| Metric | Value |"
        echo "|--------|-------|"
        echo "| Mode | \`$MODE\` |"
        echo "| Total events | $CONNECTION_COUNT |"
        echo "| Blocked | $BLOCKED_COUNT |"
        [ -n "$DURATION_TEXT" ] && echo "| Pipeline duration | $DURATION_TEXT |"
        echo ""

        echo "### Connections"
        echo ""
        echo "| Domain | Status |"
        echo "|--------|--------|"

        if [ -n "$ALLOWED" ]; then
            while IFS= read -r domain; do
                [ -z "$domain" ] && continue
                if echo "$DOMAINS" | grep -qxF "$domain"; then
                    echo "| \`$domain\` | :white_check_mark: allowed |"
                fi
            done <<< "$ALLOWED"
        fi

        if [ -n "$BLOCKED_DOMAINS" ]; then
            while IFS= read -r domain; do
                [ -z "$domain" ] && continue
                echo "| \`$domain\` | :no_entry: blocked |"
            done <<< "$BLOCKED_DOMAINS"
        fi

        if [ -n "$BLOCKED_IPS" ]; then
            while IFS= read -r ip; do
                [ -z "$ip" ] && continue
                echo "| \`$ip\` | :no_entry: blocked (IP) |"
            done <<< "$BLOCKED_IPS"
        fi

        if [ "$MODE" = "monitor" ] && [ -n "$NEW_DOMAINS" ]; then
            while IFS= read -r domain; do
                [ -z "$domain" ] && continue
                if [ -n "$BLOCKED_DOMAINS" ] && echo "$BLOCKED_DOMAINS" | grep -qxF "$domain"; then
                    continue
                fi
                echo "| \`$domain\` | :warning: new |"
            done <<< "$NEW_DOMAINS"
        fi

        echo ""
    } >> "$GITHUB_STEP_SUMMARY"
fi

# ── Upload report to SaaS ───────────────────────────────────────────
if [ -n "${DAPIPE_API_KEY:-}" ]; then
    API_URL="${DAPIPE_API_URL:-https://app.dapipe.io}"
    REPO="${GITHUB_REPOSITORY:-unknown/unknown}"
    WORKFLOW_NAME="${GITHUB_WORKFLOW:-}"
    RUN_ID="${GITHUB_RUN_ID:-0}"
    RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${REPO}/actions/runs/${RUN_ID}"
    BRANCH="${GITHUB_REF_NAME:-}"
    COMMIT="${GITHUB_SHA:-}"

    CONNECTIONS_JSON="["
    FIRST=true
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        if [ "$FIRST" = true ]; then FIRST=false; else CONNECTIONS_JSON="${CONNECTIONS_JSON},"; fi
        CONNECTIONS_JSON="${CONNECTIONS_JSON}${line}"
    done < "$LOG_FILE"
    CONNECTIONS_JSON="${CONNECTIONS_JSON}]"

    REPORT_BODY=$(cat <<ENDJSON
{"repo":"${REPO}","workflow_name":"${WORKFLOW_NAME}","run_id":"${RUN_ID}","run_url":"${RUN_URL}","branch":"${BRANCH}","commit_sha":"${COMMIT}","mode":"${MODE}","connections":${CONNECTIONS_JSON}}
ENDJSON
)

    curl -sf --max-time 15 \
        -X POST \
        -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$REPORT_BODY" \
        "$API_URL/api/v1/report" >/dev/null 2>&1 || true
fi

# ── Set outputs ──────────────────────────────────────────────────────
if [ -n "${GITHUB_OUTPUT:-}" ]; then
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

# ── Exit code ────────────────────────────────────────────────────────
if [ "$MODE" = "restrict" ] && [ "$NEW_COUNT" -gt 0 ]; then
    echo "DaPipe: $BLOCKED_COUNT connection(s) blocked."
    exit 1
fi

echo "DaPipe: $CONNECTION_COUNT connection(s) monitored, $BLOCKED_COUNT blocked."
exit 0
