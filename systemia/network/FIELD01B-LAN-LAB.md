# Evercraft Network | Field01B Authorized LAN Courier Lab

**Status: source-stage synthetic lab; not production or field-qualified.** This is the communications continuity project, not a community marketplace, carrier agreement or live phone service.

## What is executable

- A synthetic AES-256-GCM challenge is stored in a private sender outbox before delivery.
- The operator can explicitly start an ephemeral listener on loopback or an **assigned private IPv4** interface. Private LAN operation requires the --consent-lan flag. Public IPs, DNS hosts, generic binds and remote mutations are refused.
- The sender signs the encrypted envelope with an existing Evercraft Ed25519 device identity; the receiver admits **only a separately pinned sender key and exact expected peer identity**.
- The receiver decrypts the synthetic challenge, fsyncs a hash-linked durable replay record **before** signing an acknowledgement, and rejects duplicate delivery after restart.
- The sender verifies the pinned receiver signature, matching message and ciphertext hashes, challenge digest, freshness and replay-ledger hash **before** removing its local queued packet.
- HTTP/network errors leave the original encrypted packet queued, and a replay after an uncertain acknowledgement is held for review rather than blindly executed again.
- No private business/customer payload is permitted. This uses existing secure-envelope, file-courier, durable-state and device-identity modules.

**Security reality:** This test uses a shared 32-byte symmetric lab key, cleartext HTTP metadata, and encrypted synthetic challenges only. It is not a production E2EE system, a reviewed key exchange, real cellular service or proof of two separate physical machines.

## CI proof

    node --test tests/network-field01b-lan-lab.test.mjs

This sends real HTTP packets over localhost and validates queue-retry, signed acknowledgement, replay after process restart, forged sender rejection, wrong pin, corrupted data, request bounds and tampered journal failure. It cannot certify physical LAN, Wi-Fi Direct, BLE, actual phones, 911 or RF coverage.

## Optional physical two-host operator test

**Nothing in this pull request executes on owner hardware.** Use only an operator-controlled isolated private LAN. WSL2 and Chromebook Linux containers may have NAT isolation. Never automatically change forwarding, firewall, router, DNS, UPnP or WAN exposure.

On each machine choose its own private state directory and unique node ID:

    mkdir -m 700 -p "$HOME/evercraft-field01b"
    node systemia/network/field01b-lan-cli.mjs init --root "$HOME/evercraft-field01b" --node sender-node001

Initialize the other as receiver-node002. Exchange only public PEM files from the private state directory's .identity/ed25519-public.pem. Independently verify fingerprints. **Never move private PEM keys between devices.**

Generate the 32-byte synthetic-only key on one device:

    node systemia/network/field01b-lan-cli.mjs new-key --root "$HOME/evercraft-field01b"

Transfer its 32 raw bytes by an approved secure, offline method to a 0600 file on the other device. Never paste them into chat, email, GitHub or logs. Delete the lab key after the trial.

Receiver, substituting its real assigned RFC1918 IPv4 and actual authorized files:

    node systemia/network/field01b-lan-cli.mjs listen --root "$HOME/evercraft-field01b" --node receiver-node002 --peer-node sender-node001 --peer-public /absolute/path/to/sender-public.pem --key /absolute/path/to/lab-key.bin --bind 192.168.1.50 --port 42440 --consent-lan

Receiver auto-stops in two minutes. On the sender:

    node systemia/network/field01b-lan-cli.mjs queue --root "$HOME/evercraft-field01b" --node sender-node001 --peer-node receiver-node002 --key /absolute/path/to/lab-key.bin

    node systemia/network/field01b-lan-cli.mjs deliver --root "$HOME/evercraft-field01b" --node sender-node001 --peer-node receiver-node002 --peer-public /absolute/path/to/receiver-public.pem --key /absolute/path/to/lab-key.bin --target http://192.168.1.50:42440/ --consent-lan

Test with receiver stopped before delivery, confirm RETRY_PENDING, restart and resend within the two-minute packet expiry. If the receiver committed the packet but its acknowledgement was lost, a retry is HELD_REPLAY and requires independent review. It is fail-closed at-least-once transport, not seamless exactly-once communication.

## Mandatory physical qualification gates

1. Two independently identified physical machines and measured, authorized LAN path. Private IP addresses alone are insufficient.
2. Independently witnessed packet evidence and timestamps showing link loss, retained queue, return of connectivity, and arrival of the exact challenge bytes.
3. Restart/durability and negative trials with independently preserved receipts; actual energy and radio results measured rather than assumed.
4. Review and reconcile the privately held canonical Network Core, Android APK byte custody, device signer ownership, Systemia approval and Yard/Compute attestation before any product deployment.
5. Transport adapters beyond private IP, including BLE, Wi-Fi Direct, radio gateways, carrier SIM/eSIM, require separate real hardware tests and authorizations.

**Never promote** CI success into a mobile service, coverage, physical field pass, emergency channel, public safety integration or verified carrier partnership. No external communication, subscriber activation, commercial billing or hardware execution occurred through this PR.
