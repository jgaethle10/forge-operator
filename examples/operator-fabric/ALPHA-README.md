# Independent operator alpha: first 10 minutes

**This is a voluntary engineering test, not a partnership contract, a public Fabric tool listing, or an invitation to send credentials.** You retain ownership of your existing software and decide whether to collaborate beyond this test. We have not opened a public contributor program.

The goal is small: reproduce two already tested behaviors without installing new packages or giving Evercraft access to your systems.

## Requirements

Node.js **22+**, Git and an internet connection for the second check. The first check is offline. Do not run as an administrator. Don't paste API keys into commands or send credentials in feedback.

```bash
git clone --depth 1 --branch test/operator-exchange-outsider-fabric-connect-20261017 https://github.com/jgaethle10/forge-operator.git
cd forge-operator
node examples/operator-fabric/pilot-check.mjs --offline
node examples/operator-fabric/pilot-check.mjs --live
```

**No `npm install`, `curl | bash`, authentication, data upload, payment, or MCP account required.** Review any unfamiliar source code before execution.

What those commands do:

- `--offline`: exercises standalone JSON/SSE MCP, an independent local stdio MCP test server, an ephemeral 127.0.0.1-only HTTP bridge, signed *synthetic* publisher/reviewer trust, expiry and revocation tests. It does not contact remote Fabric.
- `--live`: performs fixed, read-only public discovery at the one canonical owned origin `https://fabric.systemiacommandcenters.com/mcp` and checks the exact expected FindMyPart match and owned offer URL. It does not open a checkout or try to register your tools.

Each command prints one JSON receipt. Success means `"ok": true`; failure prints `"ok": false` and a bounded `error_code`, with exit status 1. The receipt deliberately contains no name, email, machine identifiers, keys, local file paths, tokens, passwords or user content, and every production/payment/publishing claim stays false. You can share the JSON results after reviewing them yourself. If you prefer, just tell us **which check failed** and what you observed. Don't publicly attach private code, logs, credentials, or personal information.

## What we would love you to challenge

Could you understand which capabilities are public discovery versus local tools? Did both checks behave exactly as promised? Does an independently owned tool have a clear consent and permission path without surrendering ownership? What would you need before you'd trust a real remote execution connection?

If the tests are clean and you *want* to continue, we can discuss an isolated, read-only test integration using your own mock or demo telemetry. **Nothing is automatically connected, registered, published, billed, or granted production execution rights.** The founder and Systemia must separately approve any real external publisher pilot.

## How to interpret the receipts

| Receipt state | Proves | Does not prove |
| --- | --- | --- |
| `isolated_lab_tests_passed` | The isolated test suite works on that machine | Live production publication |
| `read_only_public_discovery_verified` | The canonical public MCP supports fixed read-only discovery from that network | An outside tool is now listed or callable remotely |
| `ok:false` | A check failed on that run | Fabric is universally down or another person is at fault |

For the current implementation and independent GitHub-hosted results, see [draft PR #1370](https://github.com/jgaethle10/forge-operator/pull/1370). Please do not merge or deploy that draft merely because these checks pass.
