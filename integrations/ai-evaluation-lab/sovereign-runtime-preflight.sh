#!/usr/bin/env bash
# Read-only inventory of Evercraft's existing Sovereign AI Linux appliance.
# No package installs, downloads, sudo, service starts, sockets, or model inference.
set -u
printf '%s\n' '=== Evercraft Sovereign AI: read-only runtime inventory ==='
printf '%s\n' "hostname: $(hostname 2>/dev/null || printf unknown)"
if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  printf '%s\n' 'environment: WSL Linux'
else
  printf '%s\n' 'environment: Linux'
fi
printf '%s\n' 'appliance release: Evercraft AI Node001 pre-alpha 0.3.0 (source/field-manual reference, not an installed version claim)'
printf '%s\n' 'expected inference: pinned Qwen3-4B-Q4_K_M.gguf + llama.cpp (not Ollama)'
for command in evercraft-ai llama-server llama-cli llama-cpp-server; do
  if command -v "$command" >/dev/null 2>&1; then
    printf 'binary %-19s %s\n' "$command" "$(command -v "$command")"
  else
    printf 'binary %-19s absent_from_PATH\n' "$command"
  fi
done
for dir in /opt/evercraft-ai/runtime/current /opt/evercraft-ai/models/node001 /var/lib/evercraft-ai; do
  if [[ -d "$dir" ]]; then
    printf 'path   %-39s present\n' "$dir"
  else
    printf 'path   %-39s not_found_or_not_readable\n' "$dir"
  fi
done
model=/opt/evercraft-ai/models/node001/Qwen3-4B-Q4_K_M.gguf
if [[ -f "$model" ]]; then
  printf '%s\n' 'expected model: present'
else
  printf '%s\n' 'expected model: not_found_or_not_readable'
fi
for service in evercraft-ai.service evercraft-model.service; do
  if command -v systemctl >/dev/null 2>&1; then
    state="$(systemctl is-active "$service" 2>/dev/null || true)"
    [[ -n "$state" ]] || state='unknown'
    printf 'service %-25s %s\n' "$service" "$state"
  else
    printf 'service %-25s systemctl_unavailable\n' "$service"
  fi
done
printf '%s\n' '=== Interpretation ==='
printf '%s\n' 'This checks expected Node001 appliance paths only. A missing path on Node002 does not mean the sovereign project was not built.'
printf '%s\n' 'No inference request was sent. No host services were changed. No model contents or secrets were read.'
