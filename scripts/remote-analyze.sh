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

# Unique observed domains (from "domain" field)
ALL_DOMAINS=$(echo "$FILTERED" | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
# Also capture direct IPs from connect events where domain is empty
DIRECT_CONNECT_IPS=$(echo "$FILTERED" | grep '"domain":""' | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
# Merge direct IPs into ALL_DOMAINS so they get categorized
if [ -n "$DIRECT_CONNECT_IPS" ]; then
    ALL_DOMAINS=$(printf '%s\n%s' "$ALL_DOMAINS" "$DIRECT_CONNECT_IPS" | sort -u | grep -v '^$' || true)
fi
# Blocked domains — only real domains, not IPs
BLOCKED_DOMAINS=$(echo "$FILTERED" | grep '"blocked"' | sed -n 's/.*"domain":"\([^"]*\)".*/\1/p' | sort -u | grep -vE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^$' || true)
# Blocked IPs — from domain field (IP as domain) OR ip field when domain is empty/IP
BLOCKED_IPS_FROM_DOMAIN=$(echo "$FILTERED" | grep '"blocked"' | sed -n 's/.*"domain":"\([0-9][0-9.]*[0-9]\)".*/\1/p' | sort -u | grep -v '^$' || true)
BLOCKED_IPS_FROM_IP=$(echo "$FILTERED" | grep '"blocked"' | grep '"domain":""' | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
BLOCKED_IPS=$(printf '%s\n%s' "$BLOCKED_IPS_FROM_DOMAIN" "$BLOCKED_IPS_FROM_IP" | sort -u | grep -v '^$' || true)

# Split ALL_DOMAINS into real domains vs direct IPs (an IP looks like N.N.N.N)
REAL_DOMAINS=""
OBSERVED_IPS=""
if [ -n "$ALL_DOMAINS" ]; then
    while IFS= read -r d; do
        [ -z "$d" ] && continue
        if echo "$d" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
            OBSERVED_IPS="${OBSERVED_IPS}${d}"$'\n'
        else
            REAL_DOMAINS="${REAL_DOMAINS}${d}"$'\n'
        fi
    done <<< "$ALL_DOMAINS"
fi
REAL_DOMAINS=$(echo "$REAL_DOMAINS" | sed '/^$/d' || true)
OBSERVED_IPS=$(echo "$OBSERVED_IPS" | sed '/^$/d' || true)

# Categorize real domains
KNOWN_ALLOWED=""
WOULD_BLOCK=""
NEW_DOMAINS=""

if [ -n "$REAL_DOMAINS" ]; then
    while IFS= read -r d; do
        [ -z "$d" ] && continue
        if [ -n "$POLICY_ALLOWED" ] && echo "$POLICY_ALLOWED" | grep -qxF "$d"; then
            KNOWN_ALLOWED="${KNOWN_ALLOWED}${d}"$'\n'
        elif [ -n "$POLICY_BLOCKED" ] && echo "$POLICY_BLOCKED" | grep -qxF "$d"; then
            WOULD_BLOCK="${WOULD_BLOCK}${d}"$'\n'
        else
            NEW_DOMAINS="${NEW_DOMAINS}${d}"$'\n'
        fi
    done <<< "$REAL_DOMAINS"
fi

# Categorize observed IPs
# Only show IPs that are in the blocked IPs policy or were explicitly curled
# All other IPs are resolved addresses / secondary connections — noise
if [ -n "$OBSERVED_IPS" ]; then
    # IPs resolved from real domain names (these are noise — hide them)
    DOMAIN_RESOLVED_IPS=$(echo "$FILTERED" | grep -E '"domain":"[a-zA-Z]' | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)

    while IFS= read -r ip; do
        [ -z "$ip" ] && continue
        # Skip if this IP was resolved from a real domain
        if [ -n "$DOMAIN_RESOLVED_IPS" ] && echo "$DOMAIN_RESOLVED_IPS" | grep -qxF "$ip"; then
            continue
        fi
        # Categorize
        if [ -n "$POLICY_BLOCKED_IPS" ] && echo "$POLICY_BLOCKED_IPS" | grep -qxF "$ip"; then
            WOULD_BLOCK="${WOULD_BLOCK}${ip} (IP)"$'\n'
        else
            NEW_DOMAINS="${NEW_DOMAINS}${ip} (IP)"$'\n'
        fi
    done <<< "$OBSERVED_IPS"
fi

KNOWN_ALLOWED=$(echo "$KNOWN_ALLOWED" | sed '/^$/d' || true)
WOULD_BLOCK=$(echo "$WOULD_BLOCK" | sed '/^$/d' || true)
NEW_DOMAINS=$(echo "$NEW_DOMAINS" | sed '/^$/d' || true)

KNOWN_ALLOWED_COUNT=0
[ -n "$KNOWN_ALLOWED" ] && KNOWN_ALLOWED_COUNT=$(echo "$KNOWN_ALLOWED" | wc -l | tr -d ' ')
WOULD_BLOCK_COUNT=0
[ -n "$WOULD_BLOCK" ] && WOULD_BLOCK_COUNT=$(echo "$WOULD_BLOCK" | wc -l | tr -d ' ')
NEW_DOMAIN_COUNT=0
[ -n "$NEW_DOMAINS" ] && NEW_DOMAIN_COUNT=$(echo "$NEW_DOMAINS" | wc -l | tr -d ' ')
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
        [ -n "$ip" ] && echo "::error::DaPipe: blocked IP $ip"
    done
else
    [ -n "$NEW_DOMAINS" ] && echo "$NEW_DOMAINS" | while IFS= read -r d; do
        [ -n "$d" ] && echo "::warning::DaPipe: new observed domain $d"
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
            # Split blocked into known (in policy) vs new (not in any list)
            KNOWN_BLOCKED_DOMAINS=""
            NEW_BLOCKED_DOMAINS=""
            if [ -n "$BLOCKED_DOMAINS" ]; then
                while IFS= read -r d; do
                    [ -z "$d" ] && continue
                    if [ -n "$POLICY_BLOCKED" ] && echo "$POLICY_BLOCKED" | grep -qxF "$d"; then
                        KNOWN_BLOCKED_DOMAINS="${KNOWN_BLOCKED_DOMAINS}${d}"$'\n'
                    else
                        NEW_BLOCKED_DOMAINS="${NEW_BLOCKED_DOMAINS}${d}"$'\n'
                    fi
                done <<< "$BLOCKED_DOMAINS"
            fi
            KNOWN_BLOCKED_DOMAINS=$(echo "$KNOWN_BLOCKED_DOMAINS" | sed '/^$/d' || true)
            NEW_BLOCKED_DOMAINS=$(echo "$NEW_BLOCKED_DOMAINS" | sed '/^$/d' || true)

            KNOWN_BLOCKED_IPS=""
            NEW_BLOCKED_IPS=""
            if [ -n "$BLOCKED_IPS" ]; then
                while IFS= read -r ip; do
                    [ -z "$ip" ] && continue
                    if [ -n "$POLICY_BLOCKED_IPS" ] && echo "$POLICY_BLOCKED_IPS" | grep -qxF "$ip"; then
                        KNOWN_BLOCKED_IPS="${KNOWN_BLOCKED_IPS}${ip}"$'\n'
                    else
                        NEW_BLOCKED_IPS="${NEW_BLOCKED_IPS}${ip}"$'\n'
                    fi
                done <<< "$BLOCKED_IPS"
            fi
            KNOWN_BLOCKED_IPS=$(echo "$KNOWN_BLOCKED_IPS" | sed '/^$/d' || true)
            NEW_BLOCKED_IPS=$(echo "$NEW_BLOCKED_IPS" | sed '/^$/d' || true)

            KB_D=0; [ -n "$KNOWN_BLOCKED_DOMAINS" ] && KB_D=$(echo "$KNOWN_BLOCKED_DOMAINS" | wc -l | tr -d ' ')
            KB_I=0; [ -n "$KNOWN_BLOCKED_IPS" ] && KB_I=$(echo "$KNOWN_BLOCKED_IPS" | wc -l | tr -d ' ')
            # Also find observed-but-not-blocked IPs (connected in restrict but not in any policy)
            UNBLOCKED_NEW_IPS=""
            if [ -n "$OBSERVED_IPS" ]; then
                DOMAIN_RESOLVED_IPS2=$(echo "$FILTERED" | grep -E '"domain":"[a-zA-Z]' | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p' | sort -u | grep -v '^$' || true)
                while IFS= read -r ip; do
                    [ -z "$ip" ] && continue
                    [ -n "$DOMAIN_RESOLVED_IPS2" ] && echo "$DOMAIN_RESOLVED_IPS2" | grep -qxF "$ip" && continue
                    [ -n "$POLICY_BLOCKED_IPS" ] && echo "$POLICY_BLOCKED_IPS" | grep -qxF "$ip" && continue
                    UNBLOCKED_NEW_IPS="${UNBLOCKED_NEW_IPS}${ip}"$'\n'
                done <<< "$OBSERVED_IPS"
            fi
            UNBLOCKED_NEW_IPS=$(echo "$UNBLOCKED_NEW_IPS" | sed '/^$/d' || true)

            NB_D=0; [ -n "$NEW_BLOCKED_DOMAINS" ] && NB_D=$(echo "$NEW_BLOCKED_DOMAINS" | wc -l | tr -d ' ')
            NB_I=0; [ -n "$NEW_BLOCKED_IPS" ] && NB_I=$(echo "$NEW_BLOCKED_IPS" | wc -l | tr -d ' ')
            UNB_I=0; [ -n "$UNBLOCKED_NEW_IPS" ] && UNB_I=$(echo "$UNBLOCKED_NEW_IPS" | wc -l | tr -d ' ')

            [ "$KB_D" -gt 0 ] || [ "$KB_I" -gt 0 ] && echo "| Blocked (existing) | $((KB_D + KB_I)) |"
            [ "$NB_D" -gt 0 ] || [ "$NB_I" -gt 0 ] || [ "$UNB_I" -gt 0 ] && echo "| Blocked (new) | $((NB_D + NB_I + UNB_I)) |"
        else
            [ "$WOULD_BLOCK_COUNT" -gt 0 ] && echo "| Would be blocked (existing) | $WOULD_BLOCK_COUNT |"
            [ "$NEW_DOMAIN_COUNT" -gt 0 ] && echo "| Would be blocked (new) | $NEW_DOMAIN_COUNT |"
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
            # Blocked (existing)
            if [ -n "$KNOWN_BLOCKED_DOMAINS" ] || [ -n "$KNOWN_BLOCKED_IPS" ]; then
                echo "### Blocked (existing)"
                echo ""
                echo "| Target | Type | Status |"
                echo "|--------|------|--------|"
                [ -n "$KNOWN_BLOCKED_DOMAINS" ] && echo "$KNOWN_BLOCKED_DOMAINS" | while IFS= read -r d; do
                    [ -n "$d" ] && echo "| \`$d\` | domain | :no_entry: blocked |"
                done
                [ -n "$KNOWN_BLOCKED_IPS" ] && echo "$KNOWN_BLOCKED_IPS" | while IFS= read -r ip; do
                    [ -n "$ip" ] && echo "| \`$ip\` | IP | :no_entry: blocked |"
                done
                echo ""
            fi
            # Blocked (new)
            if [ -n "$NEW_BLOCKED_DOMAINS" ] || [ -n "$NEW_BLOCKED_IPS" ] || [ -n "$UNBLOCKED_NEW_IPS" ]; then
                echo "### Blocked (new)"
                echo ""
                echo "| Target | Type | Status |"
                echo "|--------|------|--------|"
                [ -n "$NEW_BLOCKED_DOMAINS" ] && echo "$NEW_BLOCKED_DOMAINS" | while IFS= read -r d; do
                    [ -n "$d" ] && echo "| \`$d\` | domain | :warning: new blocked |"
                done
                [ -n "$NEW_BLOCKED_IPS" ] && echo "$NEW_BLOCKED_IPS" | while IFS= read -r ip; do
                    [ -n "$ip" ] && echo "| \`$ip\` | IP | :warning: new blocked |"
                done
                [ -n "$UNBLOCKED_NEW_IPS" ] && echo "$UNBLOCKED_NEW_IPS" | while IFS= read -r ip; do
                    [ -n "$ip" ] && echo "| \`$ip\` | IP | :warning: new (not blocked!) |"
                done
                echo ""
            fi
        else
            # Would be blocked (existing)
            if [ "$WOULD_BLOCK_COUNT" -gt 0 ]; then
                echo "### Would be blocked (existing)"
                echo ""
                echo "| Target | Status |"
                echo "|--------|--------|"
                echo "$WOULD_BLOCK" | while IFS= read -r t; do
                    [ -n "$t" ] && echo "| \`$t\` | :no_entry: would block |"
                done
                echo ""
            fi
            # Would be blocked (new)
            if [ "$NEW_DOMAIN_COUNT" -gt 0 ]; then
                echo "### Would be blocked (new)"
                echo ""
                echo "| Target | Status |"
                echo "|--------|--------|"
                echo "$NEW_DOMAINS" | while IFS= read -r d; do
                    [ -n "$d" ] && echo "| \`$d\` | :warning: would block |"
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

echo "DaPipe: $KNOWN_ALLOWED_COUNT allowed, $NEW_DOMAIN_COUNT new domain(s)."
