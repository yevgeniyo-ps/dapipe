#!/usr/bin/env bash
set -euo pipefail

DAPIPE_API_URL="${DAPIPE_API_URL:-https://app.dapipe.io}"
DAPIPE_LOG_DIR="${DAPIPE_LOG_DIR:-/tmp/dapipe}"
MODE="${DAPIPE_MODE:-monitor}"
LOG_FILE="$DAPIPE_LOG_DIR/connections.jsonl"
DAPIPE_HOST=$(echo "$DAPIPE_API_URL" | sed 's|https\?://||' | sed 's|/.*||')

if [ ! -f "$LOG_FILE" ] || [ ! -s "$LOG_FILE" ]; then
    echo "DaPipe: no connections captured."
    exit 0
fi

# ── Fetch policy ────────────────────────────────────────────────────
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

# ── Extract targets ─────────────────────────────────────────────────
# 1. Domains from dns/blocked events (getaddrinfo calls)
DNS_TARGETS=$(grep -E '"event":"(dns|blocked)"' "$LOG_FILE" \
    | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' \
    | grep -v "^${DAPIPE_HOST}$" \
    | sort -u | grep -v '^$' || true)

# 2. Direct IPs from connect events — IPs NOT in the resolved_ips file
#    The hook writes resolved IPs to resolved_ips.txt during getaddrinfo.
#    Any IP in a connect event that's NOT in that file = direct IP connection.
RESOLVED_FILE="$DAPIPE_LOG_DIR/resolved_ips.txt"
RESOLVED_IPS=""
[ -f "$RESOLVED_FILE" ] && RESOLVED_IPS=$(sort -u "$RESOLVED_FILE" | grep -v '^$' || true)

# Get all unique IPs from connect/blocked events
ALL_CONNECT_IPS=$(sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' "$LOG_FILE" \
    | sort -u | grep -v '^$' || true)

DIRECT_IPS=""
if [ -n "$ALL_CONNECT_IPS" ]; then
    while IFS= read -r ip; do
        [ -z "$ip" ] && continue
        # Skip if it's a resolved IP of a domain
        if [ -n "$RESOLVED_IPS" ] && echo "$RESOLVED_IPS" | grep -qxF "$ip"; then
            continue
        fi
        # Skip loopback
        [ "$ip" = "127.0.0.1" ] || [ "$ip" = "::1" ] && continue
        DIRECT_IPS="${DIRECT_IPS}${ip}"$'\n'
    done <<< "$ALL_CONNECT_IPS"
fi
DIRECT_IPS=$(echo "$DIRECT_IPS" | sed '/^$/d' || true)

# Merge: dns targets + direct IPs
TARGETS=$(printf '%s\n%s' "$DNS_TARGETS" "$DIRECT_IPS" | sort -u | grep -v '^$' || true)

BLOCKED=$(grep '"event":"blocked"' "$LOG_FILE" \
    | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' \
    | grep -v "^${DAPIPE_HOST}$" \
    | sort -u | grep -v '^$' || true)

# ── Categorize ──────────────────────────────────────────────────────
ALLOWED=""
EXISTING=""
NEW=""

if [ -n "$TARGETS" ]; then
    while IFS= read -r t; do
        [ -z "$t" ] && continue

        IS_IP=false
        echo "$t" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' && IS_IP=true
        LABEL="$t"
        [ "$IS_IP" = true ] && LABEL="$t (IP)"

        # Check: is it in the allowed policy? (domains and IPs both checked)
        if [ -n "$POLICY_ALLOWED" ] && echo "$POLICY_ALLOWED" | grep -qxF "$t"; then
            ALLOWED="${ALLOWED}${LABEL}"$'\n'
            continue
        fi

        # Check: is it in the blocked policy?
        IN_POLICY=false
        if [ "$IS_IP" = true ] && [ -n "$POLICY_BLOCKED_IPS" ] && echo "$POLICY_BLOCKED_IPS" | grep -qxF "$t"; then
            IN_POLICY=true
        fi
        if [ -n "$POLICY_BLOCKED" ] && echo "$POLICY_BLOCKED" | grep -qxF "$t"; then
            IN_POLICY=true
        fi

        if [ "$IN_POLICY" = true ]; then
            EXISTING="${EXISTING}${LABEL}"$'\n'
        else
            NEW="${NEW}${LABEL}"$'\n'
        fi
    done <<< "$TARGETS"
fi

ALLOWED=$(echo "$ALLOWED" | sed '/^$/d' || true)
EXISTING=$(echo "$EXISTING" | sed '/^$/d' || true)
NEW=$(echo "$NEW" | sed '/^$/d' || true)

A_COUNT=0; [ -n "$ALLOWED" ] && A_COUNT=$(echo "$ALLOWED" | wc -l | tr -d ' ')
E_COUNT=0; [ -n "$EXISTING" ] && E_COUNT=$(echo "$EXISTING" | wc -l | tr -d ' ')
N_COUNT=0; [ -n "$NEW" ] && N_COUNT=$(echo "$NEW" | wc -l | tr -d ' ')

# ── Upload report ──────────────────────────────────────────────────
CONNECTIONS="["
FIRST=true
while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ "$FIRST" = true ] && FIRST=false || CONNECTIONS="$CONNECTIONS,"
    CONNECTIONS="$CONNECTIONS$line"
done < "$LOG_FILE"
CONNECTIONS="$CONNECTIONS]"

BODY="{\"repo\":\"${REPO}\",\"workflow_name\":\"${GITHUB_WORKFLOW:-}\",\"run_id\":\"${GITHUB_RUN_ID:-0}\",\"run_url\":\"${GITHUB_SERVER_URL:-https://github.com}/${REPO}/actions/runs/${GITHUB_RUN_ID:-0}\",\"branch\":\"${GITHUB_REF_NAME:-}\",\"commit_sha\":\"${GITHUB_SHA:-}\",\"mode\":\"${MODE}\",\"connections\":${CONNECTIONS}}"

curl -sf --max-time 15 \
    -X POST \
    -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "$DAPIPE_API_URL/api/v1/report" >/dev/null 2>&1 || true

# ── Labels ──────────────────────────────────────────────────────────
if [ "$MODE" = "restrict" ]; then
    L_EXIST="Blocked (existing)"
    L_NEW="Blocked (new)"
else
    L_EXIST="Would be blocked (existing)"
    L_NEW="Would be blocked (new)"
fi

# ── Annotations ─────────────────────────────────────────────────────
[ -n "$EXISTING" ] && echo "$EXISTING" | while IFS= read -r t; do
    [ -n "$t" ] && echo "::error::DaPipe: $t"
done
[ -n "$NEW" ] && echo "$NEW" | while IFS= read -r t; do
    if [ "$MODE" = "restrict" ]; then
        [ -n "$t" ] && echo "::error::DaPipe: $t (new)"
    else
        [ -n "$t" ] && echo "::warning::DaPipe: $t (new)"
    fi
done

# ── Step summary ────────────────────────────────────────────────────
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## DaPipe Egress Report"
        echo ""
        echo "| Metric | Value |"
        echo "|--------|-------|"
        echo "| Mode | \`$MODE\` |"
        echo "| Allowed | $A_COUNT |"
        [ "$E_COUNT" -gt 0 ] && echo "| $L_EXIST | $E_COUNT |"
        [ "$N_COUNT" -gt 0 ] && echo "| $L_NEW | $N_COUNT |"
        echo ""

        echo "| Target | Status |"
        echo "|--------|--------|"
        [ -n "$ALLOWED" ] && echo "$ALLOWED" | while IFS= read -r t; do
            [ -n "$t" ] && echo "| \`$t\` | :white_check_mark: allowed |"
        done
        [ -n "$EXISTING" ] && echo "$EXISTING" | while IFS= read -r t; do
            [ -n "$t" ] && echo "| \`$t\` | :no_entry: $L_EXIST |"
        done
        [ -n "$NEW" ] && echo "$NEW" | while IFS= read -r t; do
            [ -n "$t" ] && echo "| \`$t\` | :warning: $L_NEW |"
        done
        echo ""
    } >> "$GITHUB_STEP_SUMMARY"
fi

# ── Exit ────────────────────────────────────────────────────────────
TOTAL=$((E_COUNT + N_COUNT))
if [ "$MODE" = "restrict" ] && [ "$TOTAL" -gt 0 ]; then
    echo "DaPipe: $TOTAL target(s) blocked."
    exit 1
fi
echo "DaPipe: $A_COUNT allowed, $N_COUNT new."
