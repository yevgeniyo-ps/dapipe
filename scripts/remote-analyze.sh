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

# Filter out DaPipe's own connections
FILTERED=$(grep -v "\"domain\":\"$DAPIPE_HOST\"" "$LOG_FILE" || true)
if [ -z "$FILTERED" ]; then
    echo "DaPipe: no external connections captured."
    exit 0
fi

# Count unique domains and IPs (excluding DaPipe host)
ALLOWED_DOMAINS=$(echo "$FILTERED" | grep -v '"blocked"' | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
BLOCKED_DOMAINS=$(echo "$FILTERED" | grep '"blocked"' | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
BLOCKED_IPS=$(echo "$FILTERED" | grep '"blocked"' | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)

ALLOWED_COUNT=0
[ -n "$ALLOWED_DOMAINS" ] && ALLOWED_COUNT=$(echo "$ALLOWED_DOMAINS" | wc -l | tr -d ' ')
BLOCKED_DOMAIN_COUNT=0
[ -n "$BLOCKED_DOMAINS" ] && BLOCKED_DOMAIN_COUNT=$(echo "$BLOCKED_DOMAINS" | wc -l | tr -d ' ')
BLOCKED_IP_COUNT=0
[ -n "$BLOCKED_IPS" ] && BLOCKED_IP_COUNT=$(echo "$BLOCKED_IPS" | wc -l | tr -d ' ')

TOTAL_BLOCKED=$((BLOCKED_DOMAIN_COUNT + BLOCKED_IP_COUNT))

# Build connections JSON from full log (including DaPipe connections for the report)
CONNECTIONS="["
FIRST=true
while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ "$FIRST" = true ] && FIRST=false || CONNECTIONS="$CONNECTIONS,"
    CONNECTIONS="$CONNECTIONS$line"
done < "$LOG_FILE"
CONNECTIONS="$CONNECTIONS]"

# Upload to SaaS
REPO="${GITHUB_REPOSITORY:-unknown/unknown}"
DURATION=""
[ -n "${DAPIPE_SETUP_START:-}" ] && DURATION=$(($(date +%s) - DAPIPE_SETUP_START))

BODY="{\"repo\":\"${REPO}\",\"workflow_name\":\"${GITHUB_WORKFLOW:-}\",\"run_id\":\"${GITHUB_RUN_ID:-0}\",\"run_url\":\"${GITHUB_SERVER_URL:-https://github.com}/${REPO}/actions/runs/${GITHUB_RUN_ID:-0}\",\"branch\":\"${GITHUB_REF_NAME:-}\",\"commit_sha\":\"${GITHUB_SHA:-}\",\"mode\":\"${MODE}\",\"connections\":${CONNECTIONS}}"

RESULT=$(curl -sf --max-time 15 \
    -X POST \
    -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "$DAPIPE_API_URL/api/v1/report" 2>/dev/null || true)

STATUS=$(echo "$RESULT" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')

# GitHub annotations for blocked
if [ -n "$BLOCKED_DOMAINS" ]; then
    echo "$BLOCKED_DOMAINS" | while IFS= read -r domain; do
        [ -n "$domain" ] && echo "::error::DaPipe: blocked connection to $domain"
    done
fi
if [ -n "$BLOCKED_IPS" ]; then
    echo "$BLOCKED_IPS" | while IFS= read -r ip; do
        [ -n "$ip" ] && echo "::error::DaPipe: blocked connection to IP $ip"
    done
fi

# Step summary
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## DaPipe Egress Report"
        echo ""
        echo "| Metric | Value |"
        echo "|--------|-------|"
        echo "| Mode | \`$MODE\` |"
        echo "| Allowed domains | $ALLOWED_COUNT |"
        echo "| Blocked domains | $BLOCKED_DOMAIN_COUNT |"
        echo "| Blocked IPs | $BLOCKED_IP_COUNT |"
        [ -n "$DURATION" ] && echo "| Pipeline duration | ${DURATION}s |"
        echo ""

        # Allowed domains table
        if [ -n "$ALLOWED_DOMAINS" ]; then
            echo "### Allowed"
            echo ""
            echo "| Domain | Status |"
            echo "|--------|--------|"
            echo "$ALLOWED_DOMAINS" | while IFS= read -r d; do
                [ -n "$d" ] && echo "| \`$d\` | :white_check_mark: allowed |"
            done
            echo ""
        fi

        # Blocked table
        if [ "$TOTAL_BLOCKED" -gt 0 ]; then
            echo "### Blocked"
            echo ""
            echo "| Target | Type | Status |"
            echo "|--------|------|--------|"
            if [ -n "$BLOCKED_DOMAINS" ]; then
                echo "$BLOCKED_DOMAINS" | while IFS= read -r d; do
                    [ -n "$d" ] && echo "| \`$d\` | domain | :no_entry: blocked |"
                done
            fi
            if [ -n "$BLOCKED_IPS" ]; then
                echo "$BLOCKED_IPS" | while IFS= read -r ip; do
                    [ -n "$ip" ] && echo "| \`$ip\` | IP | :no_entry: blocked |"
                done
            fi
            echo ""
        fi
    } >> "$GITHUB_STEP_SUMMARY"
fi

# Fail if blocked
if [ "$STATUS" = "blocked" ] || [ "$TOTAL_BLOCKED" -gt 0 ]; then
    echo "DaPipe: $BLOCKED_DOMAIN_COUNT domain(s) and $BLOCKED_IP_COUNT IP(s) blocked."
    exit 1
fi

echo "DaPipe: $ALLOWED_COUNT domain(s) allowed, 0 blocked."
