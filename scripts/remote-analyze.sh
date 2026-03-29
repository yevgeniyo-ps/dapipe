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

# Fetch policy to know what's allowed/blocked
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

# Unique observed domains
ALL_DOMAINS=$(echo "$FILTERED" | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
BLOCKED_DOMAINS=$(echo "$FILTERED" | grep '"blocked"' | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
BLOCKED_IPS=$(echo "$FILTERED" | grep '"blocked"' | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)

# Direct IP connections only (where domain is empty — not resolved IPs of domains)
DIRECT_IPS=$(echo "$FILTERED" | grep '"domain":""' | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)

# Categorize domains: known-allowed, would-be-blocked, new (unknown)
KNOWN_ALLOWED=""
WOULD_BLOCK=""
NEW_DOMAINS=""
NEW_IPS=""

if [ -n "$ALL_DOMAINS" ]; then
    while IFS= read -r d; do
        [ -z "$d" ] && continue
        if [ -n "$POLICY_ALLOWED" ] && echo "$POLICY_ALLOWED" | grep -qxF "$d"; then
            KNOWN_ALLOWED="${KNOWN_ALLOWED}${d}"$'\n'
        elif [ -n "$POLICY_BLOCKED" ] && echo "$POLICY_BLOCKED" | grep -qxF "$d"; then
            WOULD_BLOCK="${WOULD_BLOCK}${d}"$'\n'
        else
            NEW_DOMAINS="${NEW_DOMAINS}${d}"$'\n'
        fi
    done <<< "$ALL_DOMAINS"
fi

# Direct IPs: categorize
if [ -n "$DIRECT_IPS" ]; then
    while IFS= read -r ip; do
        [ -z "$ip" ] && continue
        if [ -n "$POLICY_BLOCKED_IPS" ] && echo "$POLICY_BLOCKED_IPS" | grep -qxF "$ip"; then
            WOULD_BLOCK="${WOULD_BLOCK}${ip}"$'\n'
        else
            NEW_IPS="${NEW_IPS}${ip}"$'\n'
        fi
    done <<< "$DIRECT_IPS"
fi

KNOWN_ALLOWED=$(echo "$KNOWN_ALLOWED" | sed '/^$/d' || true)
WOULD_BLOCK=$(echo "$WOULD_BLOCK" | sed '/^$/d' || true)
NEW_DOMAINS=$(echo "$NEW_DOMAINS" | sed '/^$/d' || true)
NEW_IPS=$(echo "$NEW_IPS" | sed '/^$/d' || true)

KNOWN_ALLOWED_COUNT=0
[ -n "$KNOWN_ALLOWED" ] && KNOWN_ALLOWED_COUNT=$(echo "$KNOWN_ALLOWED" | wc -l | tr -d ' ')
WOULD_BLOCK_COUNT=0
[ -n "$WOULD_BLOCK" ] && WOULD_BLOCK_COUNT=$(echo "$WOULD_BLOCK" | wc -l | tr -d ' ')
NEW_DOMAIN_COUNT=0
[ -n "$NEW_DOMAINS" ] && NEW_DOMAIN_COUNT=$(echo "$NEW_DOMAINS" | wc -l | tr -d ' ')
NEW_IP_COUNT=0
[ -n "$NEW_IPS" ] && NEW_IP_COUNT=$(echo "$NEW_IPS" | wc -l | tr -d ' ')
BLOCKED_DOMAIN_COUNT=0
[ -n "$BLOCKED_DOMAINS" ] && BLOCKED_DOMAIN_COUNT=$(echo "$BLOCKED_DOMAINS" | wc -l | tr -d ' ')
BLOCKED_IP_COUNT=0
[ -n "$BLOCKED_IPS" ] && BLOCKED_IP_COUNT=$(echo "$BLOCKED_IPS" | wc -l | tr -d ' ')
TOTAL_BLOCKED=$((BLOCKED_DOMAIN_COUNT + BLOCKED_IP_COUNT))

# Build connections JSON from full log
CONNECTIONS="["
FIRST=true
while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ "$FIRST" = true ] && FIRST=false || CONNECTIONS="$CONNECTIONS,"
    CONNECTIONS="$CONNECTIONS$line"
done < "$LOG_FILE"
CONNECTIONS="$CONNECTIONS]"

# Upload to SaaS
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

# GitHub annotations
if [ "$MODE" = "restrict" ]; then
    [ -n "$BLOCKED_DOMAINS" ] && echo "$BLOCKED_DOMAINS" | while IFS= read -r d; do
        [ -n "$d" ] && echo "::error::DaPipe: blocked connection to $d"
    done
    [ -n "$BLOCKED_IPS" ] && echo "$BLOCKED_IPS" | while IFS= read -r ip; do
        [ -n "$ip" ] && echo "::error::DaPipe: blocked connection to IP $ip"
    done
else
    [ -n "$NEW_DOMAINS" ] && echo "$NEW_DOMAINS" | while IFS= read -r d; do
        [ -n "$d" ] && echo "::warning::DaPipe: new observed domain $d"
    done
    [ -n "$NEW_IPS" ] && echo "$NEW_IPS" | while IFS= read -r ip; do
        [ -n "$ip" ] && echo "::warning::DaPipe: new observed IP $ip"
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
        echo "| Allowed domains | $KNOWN_ALLOWED_COUNT |"

        if [ "$MODE" = "restrict" ]; then
            echo "| Blocked domains | $BLOCKED_DOMAIN_COUNT |"
            echo "| Blocked IPs | $BLOCKED_IP_COUNT |"
        else
            [ "$WOULD_BLOCK_COUNT" -gt 0 ] && echo "| Would be blocked in restrict | $WOULD_BLOCK_COUNT |"
            [ "$NEW_DOMAIN_COUNT" -gt 0 ] && echo "| New observed domains | $NEW_DOMAIN_COUNT |"
            [ "$NEW_IP_COUNT" -gt 0 ] && echo "| New observed IPs | $NEW_IP_COUNT |"
        fi
        [ -n "$DURATION" ] && echo "| Pipeline duration | ${DURATION}s |"
        echo ""

        # Allowed
        if [ -n "$KNOWN_ALLOWED" ]; then
            echo "### Allowed"
            echo ""
            echo "| Domain | Status |"
            echo "|--------|--------|"
            echo "$KNOWN_ALLOWED" | while IFS= read -r d; do
                [ -n "$d" ] && echo "| \`$d\` | :white_check_mark: allowed |"
            done
            echo ""
        fi

        if [ "$MODE" = "restrict" ]; then
            # Blocked
            if [ "$TOTAL_BLOCKED" -gt 0 ]; then
                echo "### Blocked"
                echo ""
                echo "| Target | Type | Status |"
                echo "|--------|------|--------|"
                [ -n "$BLOCKED_DOMAINS" ] && echo "$BLOCKED_DOMAINS" | while IFS= read -r d; do
                    [ -n "$d" ] && echo "| \`$d\` | domain | :no_entry: blocked |"
                done
                [ -n "$BLOCKED_IPS" ] && echo "$BLOCKED_IPS" | while IFS= read -r ip; do
                    [ -n "$ip" ] && echo "| \`$ip\` | IP | :no_entry: blocked |"
                done
                echo ""
            fi
        else
            # Would be blocked in restrict mode
            if [ "$WOULD_BLOCK_COUNT" -gt 0 ]; then
                echo "### Would be blocked in restrict mode"
                echo ""
                echo "| Target | Status |"
                echo "|--------|--------|"
                echo "$WOULD_BLOCK" | while IFS= read -r t; do
                    [ -n "$t" ] && echo "| \`$t\` | :no_entry: would block |"
                done
                echo ""
            fi
            # New / unknown
            if [ "$NEW_DOMAIN_COUNT" -gt 0 ] || [ "$NEW_IP_COUNT" -gt 0 ]; then
                echo "### New (not in egress rules)"
                echo ""
                echo "| Target | Type | Status |"
                echo "|--------|------|--------|"
                [ -n "$NEW_DOMAINS" ] && echo "$NEW_DOMAINS" | while IFS= read -r d; do
                    [ -n "$d" ] && echo "| \`$d\` | domain | :warning: new |"
                done
                [ -n "$NEW_IPS" ] && echo "$NEW_IPS" | while IFS= read -r ip; do
                    [ -n "$ip" ] && echo "| \`$ip\` | IP | :warning: new |"
                done
                echo ""
            fi
        fi
    } >> "$GITHUB_STEP_SUMMARY"
fi

# Exit code
if [ "$MODE" = "restrict" ] && [ "$TOTAL_BLOCKED" -gt 0 ]; then
    echo "DaPipe: $BLOCKED_DOMAIN_COUNT domain(s) and $BLOCKED_IP_COUNT IP(s) blocked."
    exit 1
fi

echo "DaPipe: $KNOWN_ALLOWED_COUNT allowed, $NEW_DOMAIN_COUNT new domain(s), $NEW_IP_COUNT new IP(s)."
