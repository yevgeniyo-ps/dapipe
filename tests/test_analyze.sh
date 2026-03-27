#!/usr/bin/env bash
# tests/test_analyze.sh — Unit tests for scripts/analyze.sh using synthetic data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANALYZE="${SCRIPT_DIR}/../scripts/analyze.sh"
PASS=0
FAIL=0

# ── Helpers ──────────────────────────────────────────────────────────────

setup_test() {
    TEST_DIR=$(mktemp -d)
    export DAPIPE_LOG_DIR="$TEST_DIR"
    export GITHUB_OUTPUT="$TEST_DIR/output"
    export GITHUB_STEP_SUMMARY="$TEST_DIR/summary.md"
    touch "$GITHUB_OUTPUT" "$GITHUB_STEP_SUMMARY"
}

teardown_test() {
    rm -rf "$TEST_DIR"
    unset DAPIPE_LOG_DIR GITHUB_OUTPUT GITHUB_STEP_SUMMARY
}

assert_exit() {
    local expected="$1" actual="$2" name="$3"
    if [ "$expected" = "$actual" ]; then
        echo "  PASS: $name (exit=$actual)"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name — expected exit=$expected, got $actual"
        FAIL=$((FAIL + 1))
    fi
}

assert_contains() {
    local file="$1" pattern="$2" name="$3"
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name — '$pattern' not found in $file"
        FAIL=$((FAIL + 1))
    fi
}

assert_not_contains() {
    local file="$1" pattern="$2" name="$3"
    if ! grep -q "$pattern" "$file" 2>/dev/null; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name — '$pattern' unexpectedly found in $file"
        FAIL=$((FAIL + 1))
    fi
}

# ── Synthetic log data ───────────────────────────────────────────────────

write_log() {
    cat > "$DAPIPE_LOG_DIR/connections.jsonl" <<'JSONL'
{"ts":1700000000.123,"event":"dns","domain":"github.com","ip":"","port":0,"pid":100,"ppid":1,"process":"curl"}
{"ts":1700000000.200,"event":"connect","domain":"github.com","ip":"140.82.121.4","port":443,"pid":100,"ppid":1,"process":"curl"}
{"ts":1700000001.100,"event":"dns","domain":"evil.example.com","ip":"","port":0,"pid":101,"ppid":1,"process":"wget"}
{"ts":1700000001.200,"event":"connect","domain":"evil.example.com","ip":"198.51.100.1","port":443,"pid":101,"ppid":1,"process":"wget"}
{"ts":1700000002.100,"event":"dns","domain":"registry.npmjs.org","ip":"","port":0,"pid":102,"ppid":1,"process":"npm"}
{"ts":1700000002.200,"event":"connect","domain":"registry.npmjs.org","ip":"104.16.0.1","port":443,"pid":102,"ppid":1,"process":"npm"}
JSONL
}

write_baseline() {
    cat > "$TEST_DIR/baseline.json" <<'JSON'
{
  "version": 1,
  "allowed_domains": [
    "github.com",
    "registry.npmjs.org"
  ]
}
JSON
}

# ── Tests ────────────────────────────────────────────────────────────────

echo "=== Test 1: No log file → exit 0, empty outputs ==="
setup_test
rc=0; bash "$ANALYZE" "" "monitor" >/dev/null 2>&1 || rc=$?
assert_exit 0 "$rc" "no log file exits 0"
assert_contains "$GITHUB_OUTPUT" "connection-count=0" "connection-count is 0"
teardown_test

echo ""
echo "=== Test 2: Monitor mode with baseline → warns on evil.example.com ==="
setup_test
write_log
write_baseline
OUTPUT=$(bash "$ANALYZE" "$TEST_DIR/baseline.json" "monitor" 2>&1) || true
rc=0; bash "$ANALYZE" "$TEST_DIR/baseline.json" "monitor" >/dev/null 2>&1 || rc=$?
assert_exit 0 "$rc" "monitor mode exits 0"
assert_contains "$GITHUB_OUTPUT" "connection-count=6" "connection-count is 6"
assert_contains "$GITHUB_OUTPUT" "evil.example.com" "new-domains includes evil.example.com"
assert_contains "$GITHUB_STEP_SUMMARY" "evil.example.com" "summary includes evil.example.com"
assert_not_contains "$GITHUB_OUTPUT" "github.com" "new-domains excludes github.com"
teardown_test

echo ""
echo "=== Test 3: Restrict mode with baseline → fails on new domains ==="
setup_test
write_log
write_baseline
rc=0; bash "$ANALYZE" "$TEST_DIR/baseline.json" "restrict" >/dev/null 2>&1 || rc=$?
assert_exit 1 "$rc" "restrict mode exits 1 on new domains"
teardown_test

echo ""
echo "=== Test 4: Restrict mode, all domains allowed → exit 0 ==="
setup_test
write_log
# Baseline that includes all three domains
cat > "$TEST_DIR/baseline_all.json" <<'JSON'
{
  "version": 1,
  "allowed_domains": [
    "github.com",
    "registry.npmjs.org",
    "evil.example.com"
  ]
}
JSON
rc=0; bash "$ANALYZE" "$TEST_DIR/baseline_all.json" "restrict" >/dev/null 2>&1 || rc=$?
assert_exit 0 "$rc" "restrict mode exits 0 when all domains allowed"
teardown_test

echo ""
echo "=== Test 5: No baseline → all domains are new ==="
setup_test
write_log
rc=0; bash "$ANALYZE" "" "monitor" >/dev/null 2>&1 || rc=$?
assert_exit 0 "$rc" "monitor exits 0 without baseline"
assert_contains "$GITHUB_OUTPUT" "github.com" "github.com flagged without baseline"
assert_contains "$GITHUB_OUTPUT" "evil.example.com" "evil.example.com flagged without baseline"
teardown_test

echo ""
echo "════════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════"

[ "$FAIL" -eq 0 ] || exit 1
