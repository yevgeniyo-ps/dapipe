#!/usr/bin/env bash
set -euo pipefail

DAPIPE_API_URL="${DAPIPE_API_URL:-https://app.dapipe.io}"
DAPIPE_LOG_DIR="${DAPIPE_LOG_DIR:-/tmp/dapipe}"
MODE="${DAPIPE_MODE:-monitor}"
LOG_FILE="$DAPIPE_LOG_DIR/connections.jsonl"
DAPIPE_HOST=$(echo "$DAPIPE_API_URL" | sed 's|https\?://||' | sed 's|/.*||')

if [ ! -f "$LOG_FILE" ]; then
    echo "DaPipe: no connections captured."
    exit 0
fi

# ── Fetch policy to categorize ──────────────────────────────────────
REPO="${GITHUB_REPOSITORY:-unknown/unknown}"
POLICY=$(curl -sf --max-time 10 \
    -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
    "$DAPIPE_API_URL/api/v1/policy?repo=$REPO" 2>/dev/null || true)

POLICY_ALLOWED=""
POLICY_BLOCKED=""
POLICY_BLOCKED_IPS=""
if [ -n "$POLICY" ]; then
    POLICY_ALLOWED=$(echo "$POLICY" | sed -n 's/.*"allowed_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' || true)
    POLICY_BLOCKED=$(echo "$POLICY" | sed -n 's/.*"blocked_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' || true)
    POLICY_BLOCKED_IPS=$(echo "$POLICY" | sed -n 's/.*"blocked_ips":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' || true)
fi

# ── Extract targets from log ────────────────────────────────────────
# Primary source: dns + blocked events from getaddrinfo (what processes tried to reach)
# These never contain resolved IPs — only actual targets
DNS_TARGETS=$(grep -E '"event":"(dns|blocked)"' "$LOG_FILE" \
    | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' \
    | grep -v "^$DAPIPE_HOST$" \
    | sort -u | grep -v '^$' || true)

# Blocked events (restrict mode)
BLOCKED_TARGETS=$(grep '"event":"blocked"' "$LOG_FILE" \
    | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' \
    | grep -v "^$DAPIPE_HOST$" \
    | sort -u | grep -v '^$' || true)

# ── Categorize ──────────────────────────────────────────────────────
ALLOWED=""
EXISTING_BLOCKED=""
NEW_BLOCKED=""

if [ -n "$DNS_TARGETS" ]; then
    while IFS= read -r target; do
        [ -z "$target" ] && continue

        # Check if it's an IP
        IS_IP=false
        echo "$target" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' && IS_IP=true

        # Is it blocked (appeared in blocked events)?
        IS_BLOCKED=false
        [ -n "$BLOCKED_TARGETS" ] && echo "$BLOCKED_TARGETS" | grep -qxF "$target" && IS_BLOCKED=true

        # Categorize
        if [ "$IS_IP" = true ]; then
            if [ -n "$POLICY_BLOCKED_IPS" ] && echo "$POLICY_BLOCKED_IPS" | grep -qxF "$target"; then
                EXISTING_BLOCKED="${EXISTING_BLOCKED}${target} (IP)"$'\n'
            elif [ "$IS_BLOCKED" = true ]; then
                NEW_BLOCKED="${NEW_BLOCKED}${target} (IP)"$'\n'
            else
                NEW_BLOCKED="${NEW_BLOCKED}${target} (IP)"$'\n'
            fi
        else
            if [ -n "$POLICY_ALLOWED" ] && echo "$POLICY_ALLOWED" | grep -qxF "$target"; then
                ALLOWED="${ALLOWED}${target}"$'\n'
            elif [ -n "$POLICY_BLOCKED" ] && echo "$POLICY_BLOCKED" | grep -qxF "$target"; then
                EXISTING_BLOCKED="${EXISTING_BLOCKED}${target}"$'\n'
            elif [ "$IS_BLOCKED" = true ]; then
                NEW_BLOCKED="${NEW_BLOCKED}${target}"$'\n'
            else
                NEW_BLOCKED="${NEW_BLOCKED}${target}"$'\n'
            fi
        fi
    done <<< "$DNS_TARGETS"
fi

ALLOWED=$(echo "$ALLOWED" | sed '/^$/d' || true)
EXISTING_BLOCKED=$(echo "$EXISTING_BLOCKED" | sed '/^$/d' || true)
NEW_BLOCKED=$(echo "$NEW_BLOCKED" | sed '/^$/d' || true)

ALLOWED_COUNT=0; [ -n "$ALLOWED" ] && ALLOWED_COUNT=$(echo "$ALLOWED" | wc -l | tr -d ' ')
EXISTING_COUNT=0; [ -n "$EXISTING_BLOCKED" ] && EXISTING_COUNT=$(echo "$EXISTING_BLOCKED" | wc -l | tr -d ' ')
NEW_COUNT=0; [ -n "$NEW_BLOCKED" ] && NEW_COUNT=$(echo "$NEW_BLOCKED" | wc -l | tr -d ' ')

# ── Upload report to SaaS ──────────────────────────────────────────
CONNECTIONS="["
FIRST=true
while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ "$FIRST" = true ] && FIRST=false || CONNECTIONS="$CONNECTIONS,"
    CONNECTIONS="$CONNECTIONS$line"
done < "$LOG_FILE"
CONNECTIONS="$CONNECTIONS]"

DURATION=""
[ -n "${DAPIPE_SETUP_START:-}" ] && DURATION=$(($(date +%s) - DAPIPE_SETUP_START))

BODY="{\"repo\":\"${REPO}\",\"workflow_name\":\"${GITHUB_WORKFLOW:-}\",\"run_id\":\"${GITHUB_RUN_ID:-0}\",\"run_url\":\"${GITHUB_SERVER_URL:-https://github.com}/${REPO}/actions/runs/${GITHUB_RUN_ID:-0}\",\"branch\":\"${GITHUB_REF_NAME:-}\",\"commit_sha\":\"${GITHUB_SHA:-}\",\"mode\":\"${MODE}\",\"connections\":${CONNECTIONS}}"

curl -sf --max-time 15 \
    -X POST \
    -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "$DAPIPE_API_URL/api/v1/report" >/dev/null 2>&1 || true

# ── GitHub annotations ──────────────────────────────────────────────
if [ -n "$EXISTING_BLOCKED" ]; then
    echo "$EXISTING_BLOCKED" | while IFS= read -r t; do
        [ -n "$t" ] && echo "::error::DaPipe: blocked $t"
    done
fi
if [ -n "$NEW_BLOCKED" ]; then
    echo "$NEW_BLOCKED" | while IFS= read -r t; do
        if [ "$MODE" = "restrict" ]; then
            [ -n "$t" ] && echo "::error::DaPipe: blocked $t (new)"
        else
            [ -n "$t" ] && echo "::warning::DaPipe: new egress to $t"
        fi
    done
fi

# ── Step summary ────────────────────────────────────────────────────
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    RESTRICT_LABEL="Blocked"
    MONITOR_LABEL="Would be blocked"
    LABEL="$MONITOR_LABEL"
    [ "$MODE" = "restrict" ] && LABEL="$RESTRICT_LABEL"

    {
        echo "## DaPipe Egress Report"
        echo ""
        echo "| Metric | Value |"
        echo "|--------|-------|"
        echo "| Mode | \`$MODE\` |"
        echo "| Allowed | $ALLOWED_COUNT |"
        [ "$EXISTING_COUNT" -gt 0 ] && echo "| $LABEL (existing) | $EXISTING_COUNT |"
        [ "$NEW_COUNT" -gt 0 ] && echo "| $LABEL (new) | $NEW_COUNT |"
        [ -n "$DURATION" ] && echo "| Pipeline duration | ${DURATION}s |"
        echo ""

        if [ -n "$ALLOWED" ]; then
            echo "### Allowed"
            echo ""
            echo "| Target | Status |"
            echo "|--------|--------|"
            echo "$ALLOWED" | while IFS= read -r t; do
                [ -n "$t" ] && echo "| \`$t\` | :white_check_mark: allowed |"
            done
            echo ""
        fi

        if [ -n "$EXISTING_BLOCKED" ]; then
            echo "### $LABEL (existing)"
            echo ""
            echo "| Target | Status |"
            echo "|--------|--------|"
            echo "$EXISTING_BLOCKED" | while IFS= read -r t; do
                [ -n "$t" ] && echo "| \`$t\` | :no_entry: $LABEL |"
            done
            echo ""
        fi

        if [ -n "$NEW_BLOCKED" ]; then
            echo "### $LABEL (new)"
            echo ""
            echo "| Target | Status |"
            echo "|--------|--------|"
            echo "$NEW_BLOCKED" | while IFS= read -r t; do
                [ -n "$t" ] && echo "| \`$t\` | :warning: $LABEL |"
            done
            echo ""
        fi
    } >> "$GITHUB_STEP_SUMMARY"
fi

# ── Exit code ───────────────────────────────────────────────────────
TOTAL_ISSUES=$((EXISTING_COUNT + NEW_COUNT))
if [ "$MODE" = "restrict" ] && [ "$TOTAL_ISSUES" -gt 0 ]; then
    echo "DaPipe: $TOTAL_ISSUES target(s) blocked."
    exit 1
fi

echo "DaPipe: $ALLOWED_COUNT allowed, $NEW_COUNT new target(s) observed."
