#!/usr/bin/env bash
# Read-only SSH ingress preflight for the owned Demand Command NextGen→Penguin bridge.
# Does not install packages, activate SSH, change firewall, touch DNS or expose credentials.
set -u
echo "=== EVERCRAFT DEMAND / PENGUIN SSH PREFLIGHT ==="
printf 'Host: '; hostname
printf 'User: '; id -un
if [[ -x /usr/sbin/sshd ]]; then echo "OpenSSH server executable: PRESENT"
elif command -v sshd >/dev/null 2>&1; then echo "OpenSSH server executable: PRESENT"
else echo "OpenSSH server executable: ABSENT"; fi

for name in ssh.service ssh.socket sshd.service sshd.socket; do
  state="$(systemctl is-active "$name" 2>/dev/null || true)"
  enabled="$(systemctl is-enabled "$name" 2>/dev/null || true)"
  printf '%s: active=%s enabled=%s\n' "$name" "${state:-unknown}" "${enabled:-unknown}"
done
echo
echo "TCP listeners (Crostini SSH candidate 8222, default SSH 22 and private Demand reverse-forward 18897):"
if command -v ss >/dev/null 2>&1; then
  ss -H -ltn '( sport = :8222 or sport = :22 or sport = :18897 )' || true
else
  echo "ss not installed"
fi
echo
echo "Penguin Linux global IPv4 interface addresses (NOT necessarily ChromeOS LAN IP):"
if command -v ip >/dev/null 2>&1; then
  ip -4 -o addr show scope global | awk '{print $2, $4}' || true
else echo "ip utility not installed"; fi
echo
if [[ -r /etc/ssh/ssh_host_ed25519_key.pub ]] && command -v ssh-keygen >/dev/null 2>&1; then
  echo "Existing public SSH ED25519 host-key fingerprint:"
  ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
else
  echo "SSH public host key: unavailable (no public fingerprint to inspect)"
fi
echo
echo "Existing Fabric edge unaffected; this command made no changes."
echo "IMPORTANT: Chromebook LAN routing and port forwarding must be verified separately."
echo "=== PREFLIGHT COMPLETE ==="
