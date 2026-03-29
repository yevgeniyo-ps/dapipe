export async function GET() {
  const script = `#!/usr/bin/env bash
set -euo pipefail

DAPIPE_API_URL="\${DAPIPE_API_URL:-https://app.dapipe.io}"
DAPIPE_LOG_DIR="\${DAPIPE_LOG_DIR:-/tmp/dapipe}"
MODE="\${DAPIPE_MODE:-monitor}"
LOG_FILE="$DAPIPE_LOG_DIR/connections.jsonl"

if [ ! -f "$LOG_FILE" ]; then
    echo "DaPipe: no connections captured."
    exit 0
fi

# Build connections JSON
CONNECTIONS="["
FIRST=true
while IFS= read -r line; do
    [ -z "$line" ] && continue
    [ "$FIRST" = true ] && FIRST=false || CONNECTIONS="$CONNECTIONS,"
    CONNECTIONS="$CONNECTIONS$line"
done < "$LOG_FILE"
CONNECTIONS="$CONNECTIONS]"

# Upload to SaaS and get verdict
REPO="\${GITHUB_REPOSITORY:-unknown/unknown}"
DURATION=""
[ -n "\${DAPIPE_SETUP_START:-}" ] && DURATION=$(($(date +%s) - DAPIPE_SETUP_START))

BODY="{\\"repo\\":\\"$REPO\\",\\"workflow_name\\":\\"\${GITHUB_WORKFLOW:-}\\",\\"run_id\\":\\"\${GITHUB_RUN_ID:-0}\\",\\"run_url\\":\\"\${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/\${GITHUB_RUN_ID:-0}\\",\\"branch\\":\\"\${GITHUB_REF_NAME:-}\\",\\"commit_sha\\":\\"\${GITHUB_SHA:-}\\",\\"mode\\":\\"$MODE\\",\\"connections\\":$CONNECTIONS}"

RESULT=$(curl -sf --max-time 15 \\
    -X POST \\
    -H "x-dapipe-api-key: $DAPIPE_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d "$BODY" \\
    "$DAPIPE_API_URL/api/v1/report" 2>/dev/null || true)

# Parse response
STATUS=$(echo "$RESULT" | sed -n 's/.*"status":"\\([^"]*\\)".*/\\1/p')
BLOCKED_COUNT=$(echo "$RESULT" | sed -n 's/.*"blocked_count":\\([0-9]*\\).*/\\1/p')
CONNECTION_COUNT=$(wc -l < "$LOG_FILE" | tr -d ' ')
[ -z "$BLOCKED_COUNT" ] && BLOCKED_COUNT=0

# GitHub annotations for blocked connections
if [ "$BLOCKED_COUNT" -gt 0 ]; then
    grep '"blocked"' "$LOG_FILE" | sed -n 's/.*"domain":"\\([^"]*\\)".*/\\1/p' | sort -u | while IFS= read -r domain; do
        [ -n "$domain" ] && echo "::error::DaPipe: blocked connection to $domain"
    done
fi

# Step summary
if [ -n "\${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## DaPipe Connection Report"
        echo ""
        echo "| Metric | Value |"
        echo "|--------|-------|"
        echo "| Mode | \\\`$MODE\\\` |"
        echo "| Connections | $CONNECTION_COUNT |"
        echo "| Blocked | $BLOCKED_COUNT |"
        [ -n "$DURATION" ] && echo "| Duration | \${DURATION}s |"
        echo ""
    } >> "$GITHUB_STEP_SUMMARY"
fi

# Fail if blocked
if [ "$STATUS" = "blocked" ]; then
    echo "DaPipe: $BLOCKED_COUNT connection(s) blocked."
    exit 1
fi

echo "DaPipe: $CONNECTION_COUNT connection(s) monitored."
`;

  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
