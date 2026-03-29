#!/usr/bin/env bash
set -euo pipefail

DAPIPE_API_URL="${DAPIPE_API_URL:-https://app.dapipe.io}"
DAPIPE_LOG_DIR="${DAPIPE_LOG_DIR:-/tmp/dapipe}"
DAPIPE_MODE="${DAPIPE_MODE:-monitor}"
BASELINE="${DAPIPE_BASELINE:-.dapipe/baseline.json}"

mkdir -p "$DAPIPE_LOG_DIR"

# Download agent binary
HOOK_SO="$DAPIPE_LOG_DIR/dapipe_hook.so"
ARCH=$(uname -m)
[ "$ARCH" = "aarch64" ] && ARCH="arm64"

curl -sf --max-time 30 \
    -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
    -o "$HOOK_SO" \
    "$DAPIPE_API_URL/api/v1/agent?arch=$ARCH" 2>/dev/null

if [ ! -f "$HOOK_SO" ] || [ ! -s "$HOOK_SO" ]; then
    echo "::error::DaPipe: agent initialization failed."
    exit 1
fi

# Fetch policy
REPO="${GITHUB_REPOSITORY:-unknown/unknown}"
POLICY=$(curl -sf --max-time 10 \
    -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
    "$DAPIPE_API_URL/api/v1/policy?repo=$REPO" 2>/dev/null || true)

MODE="$DAPIPE_MODE"
ALLOWED_DOMAINS=""
BLOCKED_DOMAINS=""
BLOCKED_IPS=""

if [ -n "$POLICY" ]; then
    SAAS_MODE=$(echo "$POLICY" | sed -n 's/.*"mode":"\([^"]*\)".*/\1/p')
    [ -n "$SAAS_MODE" ] && [ "$MODE" = "monitor" ] && MODE="$SAAS_MODE"
    ALLOWED_DOMAINS=$(echo "$POLICY" | sed -n 's/.*"allowed_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)
    BLOCKED_DOMAINS=$(echo "$POLICY" | sed -n 's/.*"blocked_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)
    BLOCKED_IPS=$(echo "$POLICY" | sed -n 's/.*"blocked_ips":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)
fi

# Read local baseline in restrict mode
if [ "$MODE" = "restrict" ] && [ -f "$BASELINE" ]; then
    LOCAL=$(sed -n '/"allowed_domains"/,/]/p' "$BASELINE" \
        | sed -n 's/.*"\([^"]*\)".*/\1/p' \
        | grep -v 'allowed_domains' \
        | paste -sd ',' - || true)
    [ -n "$LOCAL" ] && ALLOWED_DOMAINS="${ALLOWED_DOMAINS:+$ALLOWED_DOMAINS,}$LOCAL"
fi

# Always allow DaPipe host
DAPIPE_HOST=$(echo "$DAPIPE_API_URL" | sed 's|https\?://||' | sed 's|/.*||')
[ -n "$DAPIPE_HOST" ] && ALLOWED_DOMAINS="${ALLOWED_DOMAINS:+$ALLOWED_DOMAINS,}$DAPIPE_HOST"

# Export to GITHUB_ENV and mask values from logs
if [ -n "${GITHUB_ENV:-}" ]; then
    echo "::add-mask::$HOOK_SO"
    echo "::add-mask::$DAPIPE_LOG_DIR"
    echo "LD_PRELOAD=$HOOK_SO" >> "$GITHUB_ENV"
    echo "DAPIPE_LOG_DIR=$DAPIPE_LOG_DIR" >> "$GITHUB_ENV"
    echo "DAPIPE_MODE=$MODE" >> "$GITHUB_ENV"
    if [ -n "$ALLOWED_DOMAINS" ]; then
        echo "::add-mask::$ALLOWED_DOMAINS"
        echo "DAPIPE_ALLOWED_DOMAINS=$ALLOWED_DOMAINS" >> "$GITHUB_ENV"
    fi
    if [ -n "$BLOCKED_DOMAINS" ]; then
        echo "::add-mask::$BLOCKED_DOMAINS"
        echo "DAPIPE_BLOCKED_DOMAINS=$BLOCKED_DOMAINS" >> "$GITHUB_ENV"
    fi
    if [ -n "$BLOCKED_IPS" ]; then
        echo "::add-mask::$BLOCKED_IPS"
        echo "DAPIPE_BLOCKED_IPS=$BLOCKED_IPS" >> "$GITHUB_ENV"
    fi
    SETUP_TS=$(date +%s)
    echo "::add-mask::$SETUP_TS"
    echo "DAPIPE_SETUP_START=$SETUP_TS" >> "$GITHUB_ENV"
fi

echo "DaPipe: pipeline protection active (mode=$MODE)"
