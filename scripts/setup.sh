#!/usr/bin/env bash
# scripts/setup.sh — Build the LD_PRELOAD hook and configure the environment.
# Called as the first step when using the DaPipe GitHub Action.
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
echo "Log directory: $LOG_DIR"
echo "Mode: $MODE"

# 2. Download or build the hook binary
HOOK_SO="${LOG_DIR}/dapipe_hook.so"
API_URL="${DAPIPE_API_URL:-https://app.dapipe.io}"

if [ -n "${DAPIPE_API_KEY:-}" ]; then
    # Download pre-compiled binary from SaaS
    ARCH=$(uname -m)
    [ "$ARCH" = "aarch64" ] && ARCH="arm64"
    AGENT_VERSION="${DAPIPE_AGENT_VERSION:-latest}"
    echo "Downloading dapipe_hook.so (arch=$ARCH, version=$AGENT_VERSION) ..."

    HTTP_CODE=$(curl -sf --max-time 30 -w "%{http_code}" \
        -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
        -o "$HOOK_SO" \
        "$API_URL/api/v1/agent?arch=$ARCH&version=$AGENT_VERSION" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" != "200" ] || [ ! -f "$HOOK_SO" ] || [ ! -s "$HOOK_SO" ]; then
        echo "::warning::Binary download failed (HTTP $HTTP_CODE). Falling back to local build..."
        # Fallback: build from source if available
        HOOK_DIR="${SCRIPT_DIR}/../src/hook"
        if [ -f "$HOOK_DIR/Makefile" ]; then
            make -C "$HOOK_DIR" clean all
            HOOK_SO="$(cd "$HOOK_DIR" && pwd)/dapipe_hook.so"
        else
            echo "::error::Failed to download agent binary and no local source available."
            exit 1
        fi
    else
        echo "Downloaded: $HOOK_SO ($(wc -c < "$HOOK_SO") bytes)"
    fi
else
    # No API key — build from source
    HOOK_DIR="${SCRIPT_DIR}/../src/hook"
    if [ -f "$HOOK_DIR/Makefile" ]; then
        echo "Building dapipe_hook.so from source ..."
        make -C "$HOOK_DIR" clean all
        HOOK_SO="$(cd "$HOOK_DIR" && pwd)/dapipe_hook.so"
    else
        echo "::error::No DAPIPE_API_KEY set and no local source available. Set DAPIPE_API_KEY to download the agent."
        exit 1
    fi
fi

if [ ! -f "$HOOK_SO" ]; then
    echo "::error::dapipe_hook.so not found"
    exit 1
fi

# 3. Verify expected symbols are present
if ! nm -D "$HOOK_SO" 2>/dev/null | grep -q ' T connect'; then
    echo "::error::dapipe_hook.so missing connect symbol"
    exit 1
fi
echo "Symbol check passed."

# 4. If SaaS API key is set, fetch centralized policy and merge
SAAS_MODE=""
SAAS_ALLOWED=""
SAAS_BLOCKED_DOMAINS=""
SAAS_BLOCKED_IPS=""
if [ -n "${DAPIPE_API_KEY:-}" ]; then
    API_URL="${DAPIPE_API_URL:-https://dapipe.io}"
    REPO="${GITHUB_REPOSITORY:-unknown/unknown}"
    echo "Fetching SaaS policy from $API_URL for $REPO ..."
    SAAS_RESPONSE=$(curl -sf --max-time 10 \
        -H "x-dapipe-api-key: $DAPIPE_API_KEY" \
        "$API_URL/api/v1/policy?repo=$REPO" 2>/dev/null || true)

    if [ -n "$SAAS_RESPONSE" ]; then
        echo "SaaS policy received."
        # Parse JSON response (portable, no jq)
        SAAS_MODE=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"mode":"\([^"]*\)".*/\1/p')
        SAAS_ALLOWED=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"allowed_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)
        SAAS_BLOCKED_DOMAINS=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"blocked_domains":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)
        SAAS_BLOCKED_IPS=$(echo "$SAAS_RESPONSE" | sed -n 's/.*"blocked_ips":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sed '/^$/d' | paste -sd ',' - || true)

        # SaaS mode overrides local if set
        if [ -n "$SAAS_MODE" ]; then
            echo "SaaS policy mode: $SAAS_MODE (overrides local '$MODE')"
            MODE="$SAAS_MODE"
        fi
        # Merge SaaS blocked domains/IPs with local
        if [ -n "$SAAS_BLOCKED_DOMAINS" ]; then
            BLOCKED_DOMAINS="${BLOCKED_DOMAINS:+$BLOCKED_DOMAINS,}$SAAS_BLOCKED_DOMAINS"
            echo "Merged SaaS blocked domains: $SAAS_BLOCKED_DOMAINS"
        fi
        if [ -n "$SAAS_BLOCKED_IPS" ]; then
            BLOCKED_IPS="${BLOCKED_IPS:+$BLOCKED_IPS,}$SAAS_BLOCKED_IPS"
            echo "Merged SaaS blocked IPs: $SAAS_BLOCKED_IPS"
        fi
    else
        echo "::warning::DaPipe SaaS unreachable — continuing with local policy only."
    fi
fi

# 5. In restrict mode, read baseline and build the allowed domains list
ALLOWED_DOMAINS=""
if [ "$MODE" = "restrict" ] && [ -n "$BASELINE_PATH" ] && [ -f "$BASELINE_PATH" ]; then
    ALLOWED_DOMAINS=$(sed -n '/"allowed_domains"/,/]/p' "$BASELINE_PATH" \
        | sed -n 's/.*"\([^"]*\)".*/\1/p' \
        | grep -v 'allowed_domains' \
        | paste -sd ',' - || true)
    echo "Restrict mode (local baseline): $ALLOWED_DOMAINS"
elif [ "$MODE" = "restrict" ]; then
    echo "::warning::Restrict mode requested but no baseline file found at '$BASELINE_PATH' — no domains will be allowed."
fi

# Merge SaaS allowed domains with local baseline
if [ -n "$SAAS_ALLOWED" ]; then
    ALLOWED_DOMAINS="${ALLOWED_DOMAINS:+$ALLOWED_DOMAINS,}$SAAS_ALLOWED"
    echo "Merged SaaS allowed domains: $SAAS_ALLOWED"
fi

# Always allow the DaPipe SaaS API domain (app.dapipe.io) so the analyze step can upload reports
DAPIPE_HOST=$(echo "${DAPIPE_API_URL:-https://app.dapipe.io}" | sed 's|https\?://||' | sed 's|/.*||')
if [ -n "$DAPIPE_HOST" ] && ! echo "$ALLOWED_DOMAINS" | grep -qF "$DAPIPE_HOST"; then
    ALLOWED_DOMAINS="${ALLOWED_DOMAINS:+$ALLOWED_DOMAINS,}$DAPIPE_HOST"
    echo "Auto-allowed DaPipe SaaS host: $DAPIPE_HOST"
fi

# 6. Export environment variables for subsequent steps
if [ -n "${GITHUB_ENV:-}" ]; then
    echo "LD_PRELOAD=$HOOK_SO" >> "$GITHUB_ENV"
    echo "DAPIPE_LOG_DIR=$LOG_DIR" >> "$GITHUB_ENV"
    if [ -n "$ALLOWED_DOMAINS" ]; then
        echo "DAPIPE_ALLOWED_DOMAINS=$ALLOWED_DOMAINS" >> "$GITHUB_ENV"
    fi
    if [ -n "$BLOCKED_DOMAINS" ]; then
        echo "DAPIPE_BLOCKED_DOMAINS=$BLOCKED_DOMAINS" >> "$GITHUB_ENV"
        echo "Explicitly blocked domains: $BLOCKED_DOMAINS"
    fi
    if [ -n "$BLOCKED_IPS" ]; then
        echo "DAPIPE_BLOCKED_IPS=$BLOCKED_IPS" >> "$GITHUB_ENV"
        echo "Explicitly blocked IPs: $BLOCKED_IPS"
    fi
    echo "Exported LD_PRELOAD and DAPIPE_LOG_DIR to GITHUB_ENV"
else
    echo "Not in GitHub Actions — printing exports:"
    echo "  export LD_PRELOAD=$HOOK_SO"
    echo "  export DAPIPE_LOG_DIR=$LOG_DIR"
    [ -n "$ALLOWED_DOMAINS" ] && echo "  export DAPIPE_ALLOWED_DOMAINS=$ALLOWED_DOMAINS"
    [ -n "$BLOCKED_DOMAINS" ] && echo "  export DAPIPE_BLOCKED_DOMAINS=$BLOCKED_DOMAINS"
    [ -n "$BLOCKED_IPS" ] && echo "  export DAPIPE_BLOCKED_IPS=$BLOCKED_IPS"
fi

echo "::endgroup::"
echo "DaPipe hook is ready."
