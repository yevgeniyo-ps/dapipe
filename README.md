# DaPipe

**Stop supply chain attacks from stealing your CI secrets.**

DaPipe is a security tool for GitHub Actions that controls which servers your CI pipeline can talk to. If a compromised dependency tries to phone home to an attacker's server, DaPipe blocks the connection and tells you about it.

## The Problem

Your CI pipeline runs third-party code: npm packages, GitHub Actions, Docker images. If any of them get compromised, the attacker's code runs **inside your pipeline** with access to your secrets (API keys, deploy tokens, etc.).

That's exactly what happened in the [Trivy/TeamPCP attack (March 2026)](https://www.wiz.io/blog/trivy-compromised-teampcp-supply-chain-attack) — attackers injected malware into a popular security scanner. The malware silently stole credentials and sent them to attacker-controlled servers like `scan.aquasecurtiy.org`.

## How DaPipe Stops This

You define a list of domains your CI is **supposed** to talk to (like `github.com`, `registry.npmjs.org`). DaPipe blocks everything else.

```
Your CI pipeline tries to connect to:

  github.com           ✅  allowed (in baseline)
  registry.npmjs.org   ✅  allowed (in baseline)
  scan.aquasecurtiy.org   🚫  BLOCKED (not in baseline → attacker C2!)
```

The malware never reaches the attacker's server. Your secrets stay safe.

## How It Works (Plain English)

1. **Before your CI steps run**, DaPipe installs a tiny hook that sits between every process and the network
2. **When any process tries to connect somewhere**, the hook checks: is this domain on the allowed list?
   - **Yes** → connection goes through normally
   - **No** → connection is **blocked**, and the attempt is logged
3. **After your CI steps finish**, DaPipe generates a report showing what was allowed and what was blocked

The hook works at the operating system level — it doesn't matter if the malicious code is in a npm package, a Python script, a GitHub Action, or a compiled binary. If it tries to make a network connection, DaPipe sees it.

## Quick Start

### 1. Create a baseline file

List the domains your CI normally talks to in `.dapipe/baseline.json`:

```json
{
  "version": 1,
  "allowed_domains": [
    "github.com",
    "api.github.com",
    "registry.npmjs.org"
  ]
}
```

> **Tip**: Don't know what domains your CI uses? Run DaPipe in `monitor` mode first — it will log everything without blocking, so you can see what's normal.

### 2. Add DaPipe to your workflow

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Turn on DaPipe (restrict mode = only allow baseline domains)
      - name: DaPipe Setup
        uses: yevgeniyo-ps/dapipe@main
        with:
          step: setup
          mode: restrict
          baseline-path: .dapipe/baseline.json

      # Your normal CI steps — these run with DaPipe protection
      - run: npm ci
      - run: npm test

      # See what happened
      - name: DaPipe Analyze
        uses: yevgeniyo-ps/dapipe@main
        with:
          step: analyze
          baseline-path: .dapipe/baseline.json
          mode: restrict
```

### 3. Check the report

After the workflow runs, the step summary shows a clean table:

| Domain | Status |
|--------|--------|
| `github.com` | :white_check_mark: allowed |
| `registry.npmjs.org` | :white_check_mark: allowed |
| `scan.aquasecurtiy.org` | :no_entry: blocked |

## Modes

| Mode | What it does |
|------|-------------|
| `monitor` | Logs all connections, warns on new domains, **never blocks**. Use this first to learn what your CI normally does. |
| `restrict` | Only allows domains in the baseline. **Blocks everything else.** Use this once you have a good baseline. |

## Real-World Example: Stopping the Trivy Attack

In March 2026, attackers compromised the popular `trivy-action` GitHub Action. The malware:
1. Read secrets from memory
2. Tried to send them to `scan.aquasecurtiy.org` (typosquatted domain)
3. Had fallbacks to `tdtqy-oyaaa-aaaae-af2dq-cai.raw.icp0.io` and `plug-tab-protective-relay.trycloudflare.com`

With DaPipe in `restrict` mode, **none of those connections would succeed** because they're not in the baseline. The report would show:

| Domain | Status |
|--------|--------|
| `github.com` | :white_check_mark: allowed |
| `ghcr.io` | :white_check_mark: allowed |
| `scan.aquasecurtiy.org` | :no_entry: blocked |
| `tdtqy-oyaaa-aaaae-af2dq-cai.raw.icp0.io` | :no_entry: blocked |
| `plug-tab-protective-relay.trycloudflare.com` | :no_entry: blocked |

We run this exact scenario in our CI — see the [dogfood workflow](.github/workflows/ci.yml).

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `step` | *(required)* | `setup` or `analyze` |
| `mode` | `monitor` | `monitor` or `restrict` |
| `baseline-path` | `.dapipe/baseline.json` | Path to your allowed domains file |
| `log-dir` | `/tmp/dapipe` | Where to store connection logs |
| `blocked-domains` | | Extra domains to always block (on top of baseline) |
| `blocked-ips` | | IPs to always block |

## Generating a Baseline

Run DaPipe in `monitor` mode on a known-good build, then generate the baseline from the log:

```bash
./scripts/generate-baseline.sh /tmp/dapipe/connections.jsonl .dapipe/baseline.json
```

## Under the Hood

DaPipe uses `LD_PRELOAD` — a Linux feature that lets you inject code into any process. DaPipe injects a small library that intercepts two system functions:

- **`getaddrinfo()`** — called when a process looks up a domain name (e.g., "what's the IP for github.com?"). In restrict mode, if the domain isn't allowed, DaPipe returns a DNS failure and the connection never happens.
- **`connect()`** — called when a process opens a network connection. DaPipe logs the IP, port, and process name. If the IP is blocked, it returns "connection refused."

Every intercepted call is logged as a JSON line:
```json
{"ts":1742400010.1,"event":"blocked","domain":"scan.aquasecurtiy.org","ip":"","port":0,"pid":1002,"ppid":1,"process":"trivy"}
```

This approach is transparent to the processes — they just see normal DNS/connection failures, no crashes or weird behavior.
