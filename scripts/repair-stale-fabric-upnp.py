#!/usr/bin/env python3
"""Guarded, one-time repair of two stale Evercraft Fabric UPnP web mappings.

Requires operator confirmation and an exact match on current owner/host/port.
Does not touch DNS, diagnostic, or unrelated mappings.
"""
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

OLD, NEW = "192.168.88.3", "192.168.88.5"
EXPECTED = ((80, 18080, "Evercraft Fabric HTTP"), (443, 8443, "Evercraft Fabric HTTPS"))

with open("/etc/evercraft/router-map.env", encoding="utf-8") as f:
    config = dict(line.strip().split("=", 1) for line in f if "=" in line and not line.lstrip().startswith("#"))
if config.get("EVERCRAFT_ROUTER_LAN_HOST") != NEW:
    raise SystemExit("STOP: confirm Chromebook Wi-Fi IP and router-map.env target are still .5.")

log = subprocess.check_output([
    "sudo", "journalctl", "-u", "evercraft-router-map.service",
    "--since", "2026-10-21 08:26:00", "--until", "2026-10-21 08:27:30",
    "--no-pager", "-o", "cat",
], text=True)
control = re.search(r'"control":\s*"([^"]+)"', log)
service = re.search(r'"service_type":\s*"([^"]+)"', log)
if not control or not service:
    raise SystemExit("STOP: router UPnP control endpoint not present in earlier logs.")

url, service_type = control.group(1), service.group(1)
parsed = urllib.parse.urlsplit(url)
if parsed.scheme != "http" or parsed.hostname != config.get("EVERCRAFT_ROUTER_GATEWAY"):
    raise SystemExit("STOP: UPnP control endpoint differs from configured router.")

def field(xml, name):
    root = ET.fromstring(xml)
    return next(((e.text or "").strip() for e in root.iter()
                 if e.tag.rsplit("}", 1)[-1] == name), "")

def soap(action, params):
    fields = "".join(f"<{key}>{escape(str(value))}</{key}>" for key, value in params.items())
    body = (f'<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
            f's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>'
            f'<u:{action} xmlns:u="{service_type}">{fields}</u:{action}>'
            f'</s:Body></s:Envelope>')
    req = urllib.request.Request(url, data=body.encode(), headers={
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f'"{service_type}#{action}"',
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return response.read().decode()
    except urllib.error.HTTPError as e:
        response = e.read().decode(errors="replace")
        raise RuntimeError(
            f"{action}: HTTP {e.code}, UPnP {field(response, 'errorCode') or 'unknown'} "
            f"{field(response, 'errorDescription') or 'no details'}"
        ) from e

def selector(port):
    return {"NewRemoteHost": "", "NewExternalPort": port, "NewProtocol": "TCP"}

def lookup(port):
    xml = soap("GetSpecificPortMappingEntry", selector(port))
    return {
        "host": field(xml, "NewInternalClient"),
        "port": field(xml, "NewInternalPort"),
        "desc": field(xml, "NewPortMappingDescription"),
        "enabled": field(xml, "NewEnabled"),
        "lease": field(xml, "NewLeaseDuration"),
    }

def add(port, internal, desc, host, lease):
    soap("AddPortMapping", {
        **selector(port), "NewInternalPort": internal, "NewInternalClient": host,
        "NewEnabled": 1, "NewPortMappingDescription": desc, "NewLeaseDuration": lease,
    })

planned = []
for port, internal, desc in EXPECTED:
    actual = lookup(port)
    print(f"TCP {port}: {actual['host']}:{actual['port']}, label={actual['desc']!r}", flush=True)
    if actual["port"] != str(internal) or actual["desc"] != desc or actual["enabled"] not in ("1", "true"):
        raise SystemExit("STOP: mapping identity differs from Evercraft; nothing changed.")
    if actual["host"] == NEW:
        continue
    if actual["host"] != OLD:
        raise SystemExit("STOP: mapping belongs to another IP; nothing changed.")
    planned.append((port, internal, desc, actual["lease"] or "86400"))

if not planned:
    raise SystemExit("Both Fabric web mappings already target the right IP; nothing changed.")
if input(f"Type FIX to replace {len(planned)} stale Evercraft mappings with {NEW}: ").strip() != "FIX":
    raise SystemExit("Cancelled: nothing changed.")

for port, internal, desc, lease in planned:
    before = lookup(port)
    if (before["host"], before["port"], before["desc"]) != (OLD, str(internal), desc):
        raise SystemExit(f"STOP: TCP {port} changed since preflight; nothing more changed.")
    print(f"Updating TCP {port}...", flush=True)
    soap("DeletePortMapping", selector(port))
    try:
        add(port, internal, desc, NEW, lease)
        observed = lookup(port)
        if observed["host"] != NEW or observed["port"] != str(internal):
            raise RuntimeError(f"router readback mismatch: {observed}")
    except Exception as error:
        print(f"ERROR updating {port}: {error}", flush=True)
        try:
            print(f"Current mapping: {lookup(port)}", flush=True)
        except Exception:
            try:
                add(port, internal, desc, OLD, lease)
                print(f"Restored old mapping for TCP {port}", flush=True)
            except Exception as restore_error:
                print(f"URGENT: old TCP {port} mapping not restored: {restore_error}", flush=True)
        raise SystemExit("STOP: remaining mappings untouched. Send this output.")
    print(f"CONFIRMED: TCP {port} -> {NEW}:{internal}", flush=True)

print("DONE. Check independent public HTTPS/MCP canary before claiming recovery.")
