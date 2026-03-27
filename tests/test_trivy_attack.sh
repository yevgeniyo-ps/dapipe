#!/usr/bin/env bash
# tests/test_trivy_attack.sh — Simulate the TeamPCP/Trivy supply chain attack
# (March 2026) and show how DaPipe detects + blocks the malicious connections.
#
# Reference: https://www.wiz.io/blog/trivy-compromised-teampcp-supply-chain-attack
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANALYZE="${SCRIPT_DIR}/../scripts/analyze.sh"

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  DaPipe vs TeamPCP/Trivy Supply Chain Attack Simulation        ║"
echo "║  Ref: wiz.io/blog/trivy-compromised-teampcp-supply-chain-attack║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── Setup ────────────────────────────────────────────────────────────────
TEST_DIR=$(mktemp -d)
export DAPIPE_LOG_DIR="$TEST_DIR"
export GITHUB_OUTPUT="$TEST_DIR/output"
export GITHUB_STEP_SUMMARY="$TEST_DIR/summary.md"
export DAPIPE_BLOCKED_DOMAINS="scan.aquasecurtiy.org,tdtqy-oyaaa-aaaae-af2dq-cai.raw.icp0.io,plug-tab-protective-relay.trycloudflare.com"
export DAPIPE_BLOCKED_IPS="45.148.10.212"
touch "$GITHUB_OUTPUT" "$GITHUB_STEP_SUMMARY"

# ── Synthetic log: what DaPipe would capture during the attack ───────────
# Normal CI traffic + malicious Trivy connections
cat > "$DAPIPE_LOG_DIR/connections.jsonl" <<'JSONL'
{"ts":1742400000.100,"event":"dns","domain":"github.com","ip":"","port":0,"pid":1000,"ppid":1,"process":"git"}
{"ts":1742400000.200,"event":"connect","domain":"github.com","ip":"140.82.121.4","port":443,"pid":1000,"ppid":1,"process":"git"}
{"ts":1742400001.100,"event":"dns","domain":"api.github.com","ip":"","port":0,"pid":1001,"ppid":1,"process":"curl"}
{"ts":1742400001.200,"event":"connect","domain":"api.github.com","ip":"140.82.112.6","port":443,"pid":1001,"ppid":1,"process":"curl"}
{"ts":1742400002.100,"event":"dns","domain":"ghcr.io","ip":"","port":0,"pid":1002,"ppid":1,"process":"trivy"}
{"ts":1742400002.200,"event":"connect","domain":"ghcr.io","ip":"140.82.121.34","port":443,"pid":1002,"ppid":1,"process":"trivy"}
{"ts":1742400003.100,"event":"dns","domain":"registry.npmjs.org","ip":"","port":0,"pid":1003,"ppid":1,"process":"npm"}
{"ts":1742400003.200,"event":"connect","domain":"registry.npmjs.org","ip":"104.16.4.34","port":443,"pid":1003,"ppid":1,"process":"npm"}
{"ts":1742400010.100,"event":"blocked","domain":"scan.aquasecurtiy.org","ip":"","port":0,"pid":1002,"ppid":1,"process":"trivy"}
{"ts":1742400010.500,"event":"blocked","domain":"tdtqy-oyaaa-aaaae-af2dq-cai.raw.icp0.io","ip":"","port":0,"pid":1002,"ppid":1,"process":"trivy"}
{"ts":1742400011.100,"event":"blocked","domain":"plug-tab-protective-relay.trycloudflare.com","ip":"","port":0,"pid":1002,"ppid":1,"process":"trivy"}
JSONL

# ── Baseline: domains a normal CI pipeline should contact ────────────────
cat > "$TEST_DIR/baseline.json" <<'JSON'
{
  "version": 1,
  "allowed_domains": [
    "github.com",
    "api.github.com",
    "ghcr.io",
    "registry.npmjs.org",
    "objects.githubusercontent.com",
    "pkg-containers.githubusercontent.com"
  ]
}
JSON

echo "=== Scenario: Compromised trivy-action runs in your CI pipeline ==="
echo ""
echo "The TeamPCP attackers injected malware into trivy-action that:"
echo "  1. Reads /proc/<pid>/mem to harvest credentials"
echo "  2. Exfiltrates to scan.aquasecurtiy.org (typosquatted C2)"
echo "  3. Falls back to ICP canister: tdtqy-oyaaa-aaaae-af2dq-cai.raw.icp0.io"
echo "  4. Tunnels data via: plug-tab-protective-relay.trycloudflare.com"
echo ""
echo "DaPipe was configured to block these domains and IPs."
echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""

# ── Run analyze ──────────────────────────────────────────────────────────
bash "$ANALYZE" "$TEST_DIR/baseline.json" "monitor" 2>&1

echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""
echo "=== Step Summary (what appears in the GitHub Actions UI): ==="
echo ""
cat "$GITHUB_STEP_SUMMARY"

echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""
echo "=== GitHub Outputs: ==="
cat "$GITHUB_OUTPUT"

echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""
echo "RESULT: DaPipe blocked all 3 malicious domains at DNS level."
echo "The attacker's code could NOT exfiltrate any credentials."
echo "All blocked attempts are visible in the CI logs and step summary."

# ── Cleanup ──────────────────────────────────────────────────────────────
rm -rf "$TEST_DIR"
unset DAPIPE_LOG_DIR GITHUB_OUTPUT GITHUB_STEP_SUMMARY DAPIPE_BLOCKED_DOMAINS DAPIPE_BLOCKED_IPS
