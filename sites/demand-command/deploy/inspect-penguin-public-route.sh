#!/usr/bin/env bash
# Evercraft Demand Command public-edge preflight, read-only, privacy-safe.
set -euo pipefail
HOST=demand.systemiacommandcenters.com
echo "=== EVERCRAFT DEMAND / OWNED PUBLIC EDGE ==="
echo "Machine: $(hostname)"
if command -v systemctl >/dev/null 2>&1; then
  for unit in evercraft-public-edge.service evercraft-fabric.service ssh.service sshd.service; do
    status=$(systemctl is-active "$unit" 2>/dev/null || true)
    echo "Service $unit: ${status:-unavailable}"
  done
fi
if command -v caddy >/dev/null 2>&1; then
  echo "Caddy installed: yes"
  caddy version | head -1
else echo "Caddy installed: no"; fi
if [[ -f /etc/evercraft/Caddyfile ]]; then
  echo "Owned Caddyfile exists: yes"
  if grep -Fq "$HOST" /etc/evercraft/Caddyfile 2>/dev/null; then
    echo "Demand hostname present in Caddy config: yes"
  else
    echo "Demand hostname present in Caddy config: no"
  fi
else echo "Owned Caddyfile exists: no"; fi
if command -v getent >/dev/null 2>&1; then
  if getent ahostsv4 "$HOST" >/dev/null 2>&1; then
    echo "Demand hostname DNS resolves: yes (not proof of controlled DNS)"
  else
    echo "Demand hostname DNS resolves: no"
  fi
fi
if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:18897/ 2>/dev/null |
   grep -Fq '<title>Evercraft Demand Command | Private Console</title>'; then
  echo "Penguin reverse tunnel backend identity: PASS"
else
  echo "Penguin reverse tunnel backend identity: NOT VERIFIED"
fi
if command -v ss >/dev/null 2>&1; then
  if ss -lnt '( sport = :18897 )' 2>/dev/null | grep -q ':18897'; then
    echo "Penguin tunnel listener 18897: present (verify bound address privately)"
  else echo "Penguin tunnel listener 18897: absent"; fi
fi
echo "External trusted TLS + 401 auth gate: require independent off-LAN check."
echo "NO settings were modified. No secrets, identities, or buyer data displayed."
