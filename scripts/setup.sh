#!/usr/bin/env bash
# scripts/setup.sh — Configure DaPipe pipeline protection.
set -euo pipefail

LOG_DIR="${1:-/tmp/dapipe}"
MODE="${2:-monitor}"
BASELINE_PATH="${3:-}"
BLOCKED_DOMAINS="${4:-}"
BLOCKED_IPS="${5:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "::group::DaPipe setup"

# 1. Create log directory
mkdir -p "$LOG_DIR"

# 2. Download or build the hook binary
HOOK_SO="${LOG_DIR}/dapipe_hook.so"
API_URL="${DAPIPE_API_URL:-https://app.dapipe.io}"

if [ -n "${DAPIPE_API_KEY:-}" ]; then
    ARCH=$(uname -m)
    [ "$ARCH" = "aarch64" ] && ARCH="arm64"
    AGENT_VERSION="${DAPIPE_AGENT_VERSION:-latest}"

    HTTP_CODE=$(curl -sf --max-time 30 -w "%{http_code}" \
        -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
        -o "$HOOK_SO" \
        "$API_URL/api/v1/agent?arch=$ARCH&version=$AGENT_VERSION" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" != "200" ] || [ ! -f "$HOOK_SO" ] || [ ! -s "$HOOK_SO" ]; then
        # Fallback: build from source if available
        HOOK_DIR="${SCRIPT_DIR}/../src/hook"
        if [ -f "$HOOK_DIR/Makefile" ]; then
            make -C "$HOOK_DIR" clean all >/dev/null 2>&1
            HOOK_SO="$(cd "$HOOK_DIR" && pwd)/dapipe_hook.so"
        else
            echo "::error::DaPipe: agent initialization failed."
            exit 1
        fi
    fi
else
    HOOK_DIR="${SCRIPT_DIR}/../src/hook"
    if [ -f "$HOOK_DIR/Makefile" ]; then
        make -C "$HOOK_DIR" clean all >/dev/null 2>&1
        HOOK_SO="$(cd "$HOOK_DIR" && pwd)/dapipe_hook.so"
    else
        echo "::error::DaPipe: DAPIPE_API_KEY is required."
        exit 1
    fi
fi

if [ ! -f "$HOOK_SO" ]; then
    echo "::error::DaPipe: agent initialization failed."
    exit 1
fi

# 3. Fetch centralized policy and merge
SAAS_MODE=""
SAAS_ALLOWED=""
SAAS_BLOCKED_DOMAINS=""
SAAS_BLOCKED_IPS=""
if [ -n "${DAPIPE_API_KEY:-}" ]; then
    REPO="${GITHUB_REPOSITORY:-unknown/unknown}"
    SAAS_RESPONSE=$(curl -sf --max-time 10 \
        -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
        "$API_URL/api/v1/policy?repo=$REPO" 2>/dev/null || true)

    if [ -n "$SAAS_RESPONSE" ]; then
        SAAS_MODE=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"mode":"\([^"]*\)".*/\1/p')
        SAAS_ALLOWED=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"allowed_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)
        SAAS_BLOCKED_DOMAINS=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"blocked_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)
        SAAS_BLOCKED_IPS=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"blocked_ips":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)

        # Local mode takes precedence over SaaS
        if [ -n "$SAAS_MODE" ] && [ "$MODE" = "monitor" ]; then
            MODE="$SAAS_MODE"
        fi
        # Merge SaaS blocked domains/IPs
        if [ -n "$SAAS_BLOCKED_DOMAINS" ]; then
            BLOCKED_DOMAINS="${BLOCKED_DOMAINS:+$BLOCKED_DOMAINS,}$SAAS_BLOCKED_DOMAINS"
        fi
        if [ -n "$SAAS_BLOCKED_IPS" ]; then
            BLOCKED_IPS="${BLOCKED_IPS:+$BLOCKED_IPS,}$SAAS_BLOCKED_IPS"
        fi
    fi
fi

# 4. In restrict mode, read baseline
ALLOWED_DOMAINS=""
if [ "$MODE" = "restrict" ] && [ -n "$BASELINE_PATH" ] && [ -f "$BASELINE_PATH" ]; then
    ALLOWED_DOMAINS=$(sed -n '/"allowed_domains"/,/]/p' "$BASELINE_PATH" \
        | sed -n 's/.*"\([^"]*\)".*/\1/p' \
        | grep -v 'allowed_domains' \
        | paste -sd ',' - || true)
fi

# Merge SaaS allowed domains
if [ -n "$SAAS_ALLOWED" ]; then
    ALLOWED_DOMAINS="${ALLOWED_DOMAINS:+$ALLOWED_DOMAINS,}$SAAS_ALLOWED"
fi

# Always allow DaPipe SaaS host
DAPIPE_HOST=$(echo "${DAPIPE_API_URL:-https://app.dapipe.io}" | sed 's|https\?://||' | sed 's|/.*||')
if [ -n "$DAPIPE_HOST" ] && ! echo "$ALLOWED_DOMAINS" | grep -qF "$DAPIPE_HOST"; then
    ALLOWED_DOMAINS="${ALLOWED_DOMAINS:+$ALLOWED_DOMAINS,}$DAPIPE_HOST"
fi

# 5. Export environment variables
if [ -n "${GITHUB_ENV:-}" ]; then
    echo "LD_PRELOAD=$HOOK_SO" >> "$GITHUB_ENV"
    echo "DAPIPE_LOG_DIR=$LOG_DIR" >> "$GITHUB_ENV"
    [ -n "$ALLOWED_DOMAINS" ] && echo "DAPIPE_ALLOWED_DOMAINS=$ALLOWED_DOMAINS" >> "$GITHUB_ENV"
    [ -n "$BLOCKED_DOMAINS" ] && echo "DAPIPE_BLOCKED_DOMAINS=$BLOCKED_DOMAINS" >> "$GITHUB_ENV"
    [ -n "$BLOCKED_IPS" ] && echo "DAPIPE_BLOCKED_IPS=$BLOCKED_IPS" >> "$GITHUB_ENV"
    echo "DAPIPE_SETUP_START=$(date +%s)" >> "$GITHUB_ENV"
fi

echo "::endgroup::"
echo "DaPipe: pipeline protection active (mode=$MODE)"
