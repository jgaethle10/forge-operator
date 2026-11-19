# Evercraft Network / Saban: authorized two-device outage test

Status: laboratory software harness. The automated test uses **two processes on one physical machine**. This is NOT physical coverage, carrier service, radio, production identity, or emergency readiness. Reuses `secure-envelope.mjs` (AES-256-GCM) and `transport-router.mjs` (fail-closed evidence-qualified route).

## Equipment and authority

Two authorized Linux/Node 22+ laptops on the same operator-controlled isolated LAN/Ethernet or access point with WAN disconnected, both checked out at the same verified Git SHA. Use only synthetic messages. Explicitly consent to binding the listener to its actual assigned RFC1918 IPv4. No scanning, router/firewall changes, Wi-Fi Direct, BLE or unauthorized device access. WSL2/Crostini NAT may prevent peer reachability; document that rather than altering the host silently.

On **A**, create private state and a pairwise lab key:
```bash
mkdir -p "$HOME/evercraft-network-lab/a"
chmod 700 "$HOME/evercraft-network-lab" "$HOME/evercraft-network-lab/a"
node systemia/network/field-outage-lab.mjs init-key --key-file "$HOME/evercraft-network-lab/pair.key"
```
Transfer the 32-byte key to **B securely out of band**; never commit, email, or expose it in receipts. Its permissions MUST be 0600. On B create a mode-0700 state folder.

On **B**, with `192.168.50.12` replaced by its **actual assigned** private IPv4:
```bash
mkdir -p "$HOME/evercraft-network-lab/b"
chmod 700 "$HOME/evercraft-network-lab" "$HOME/evercraft-network-lab/b"
chmod 600 "$HOME/evercraft-network-lab/pair.key"
node systemia/network/field-outage-lab.mjs serve --id beta --peer-id alpha --state "$HOME/evercraft-network-lab/b" --key-file "$HOME/evercraft-network-lab/pair.key" --bind 192.168.50.12 --port 47820 --consent-to-lan
```
On **A**, with the securely provisioned local key:
```bash
printf 'synthetic offline test 1\n' | node systemia/network/field-outage-lab.mjs send --id alpha --peer-id beta --state "$HOME/evercraft-network-lab/a" --key-file "$HOME/evercraft-network-lab/pair.key"
node systemia/network/field-outage-lab.mjs flush --id alpha --peer-id beta --state "$HOME/evercraft-network-lab/a" --key-file "$HOME/evercraft-network-lab/pair.key" --peer-url http://192.168.50.12:47820/
```
On B:
```bash
node systemia/network/field-outage-lab.mjs inbox --id beta --state "$HOME/evercraft-network-lab/b" --key-file "$HOME/evercraft-network-lab/pair.key"
```
Stop B. Queue synthetic message 2 from A; flush must return `NO_ROUTE`, leaving outbox count 1. Restart B with the original state folder; flush again, assert B inbox count 2 and A outbox count 0. Run `node systemia/network/field-outage-lab.mjs simulate` for an explicitly **simulated** Saban capacity-offer filter; unconsented offers must never be admitted. Local regression: `node --test tests/network-field-outage-lab.test.mjs`.

## Receipts and acceptance

Each node saves append-only fsync'd `receipts.jsonl` locally. Record both real device serial-free descriptions, exact SHA, Node/OS, time, owned link type, witnessed upstream disconnect on both machines, successful encrypted delivery and signed receipt, lost-route outbox, resumed delivery, battery/runtime measurements if measured. Preserve private IPs and keys privately; obtain independent observation before calling a result field validated. A challenge-response HMAC verifies the pre-paired peer ID, not a cryptographically certified unique physical host. The data stream uses HTTP but message contents are AES-GCM authenticated/encrypted. This prototype has no revocation, PKI, public peer discovery, multi-hop, live gateway, carrier, licensed radio or satellite functionality.

Never call a mere local successful process test a two-hardware test. No emergency-message priority is implied.
## 2026-11-18 replay/ACK hardening

A successful receiver ACK now includes the SHA-256 of the exact encrypted envelope and a keyed authentication proof bound to that hash. The receiver rejects an otherwise valid encrypted packet that reuses an existing message ID with different ciphertext (HTTP 409), rather than silently acknowledging it as the same message. Existing identical encrypted retransmission is idempotently acknowledged. Local 0700 state/queue folders and 0600 regular queue files are required. This is bounded prototype hardening, not production PKI, certificate enrollment, key rotation or externally witnessed field validation. Run the Network-only test workflow or local `node --test tests/network-field-outage-lab.test.mjs tests/network-backfill-contact-lab.test.mjs`.

## Push 03: signed cross-node evidence gate (2026-11-19)

The sender's durable receipt now includes an `envelope_hash` matching the encrypted packet accepted and separately logged by the receiver. `systemia/network/field-evidence-gate.mjs` is a separate offline, local-only collector and reviewer. It makes **no outbound calls**, scans no neighbors and never opens ports. It requires a clean checkout with Git and private 0700 state directories, reads the canonical source SHA-256 hashes, validates each existing receipt hash chain, and signs a redacted observation using an Ed25519 private key **generated and retained on that node** (0600). No message contents, private IPs, network credentials, or private key bytes are exported in observation JSON.

After performing the real two-machine test above, from a clean checkout of the same exact commit on each computer:

On A (alpha, e.g. Penguin if its LAN is actually reachable):
```bash
node systemia/network/field-evidence-gate.mjs capture \
  --id alpha --peer-id beta \
  --repo "$PWD" \
  --state "$HOME/evercraft-network-lab/a" \
  --output "$HOME/evercraft-network-lab/a/alpha-observation.json" \
  --acknowledge-owned-device
```

On B (beta, e.g. NextGen, using the real already-provisioned B state):
```bash
node systemia/network/field-evidence-gate.mjs capture \
  --id beta --peer-id alpha \
  --repo "$PWD" \
  --state "$HOME/evercraft-network-lab/b" \
  --output "$HOME/evercraft-network-lab/b/beta-observation.json" \
  --acknowledge-owned-device
```

Securely bring **only the two observation JSON files** onto one authorized computer. The receiver's local identity key, pairing secret and underlying private logs stay on their respective devices. Ensure both observation files are 0600 and their containing directory is 0700. Review:

```bash
node systemia/network/field-evidence-gate.mjs review \
  --alpha /absolute/private/path/alpha-observation.json \
  --beta /absolute/private/path/beta-observation.json
```

The verifier requires matching source revision/digests and different self-generated signing keys; checks signatures; matches at least two A delivery message IDs **and exact encrypted envelope hashes** against B receive records; requires B to have started the listener twice and A to record peer unreachability between those deliveries. If proof is incomplete it returns `HOLD_INSUFFICIENT_EVIDENCE`. Tampering returns `BLOCKED`. A passing software review returns `CROSS_NODE_SOFTWARE_EVIDENCE_RECONCILED`, **never a physical certification**. Two keys or two files alone do not prove two distinct devices: independent physical witness, upstream-disconnection evidence, router/guest networking constraints and measured properties must be recorded separately.

Run `node --test tests/network-field-evidence-gate.test.mjs` to reproduce the synthetic receipt/fraud negatives. Do not upload this sensitive operational material publicly or push private reports to GitHub.
