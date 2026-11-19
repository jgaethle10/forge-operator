#!/usr/bin/env bash
# Offline, disposable lab certificate authority and short-lived site certificate.
# Never run in production; never install the root into an OS, browser or keychain.
set -euo pipefail
umask 077
OUT="${1:-}"
if [[ -z "$OUT" || "$OUT" != /* || -L "$OUT" ]]; then
  echo 'Usage: ephemeral-tls-cert.sh ABSOLUTE_NEW_PRIVATE_LAB_DIRECTORY' >&2
  exit 2
fi
if [[ -e "$OUT" ]]; then
  echo 'Refusing existing output path to avoid overwriting or reusing trust keys' >&2
  exit 2
fi
mkdir -m 0700 "$OUT"
cat > "$OUT/site.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:onthegoquicklube.evercraft
EOF
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=Evercraft Disposable CI Root - NOT FOR DEVICE TRUST' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -out "$OUT/ca.pem" -keyout "$OUT/ca.key" >/dev/null 2>&1
openssl req -new -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=onthegoquicklube.evercraft' \
  -keyout "$OUT/leaf.key" -out "$OUT/leaf.csr" >/dev/null 2>&1
openssl x509 -req -in "$OUT/leaf.csr" \
  -CA "$OUT/ca.pem" -CAkey "$OUT/ca.key" -CAcreateserial \
  -days 1 -sha256 -extfile "$OUT/site.ext" \
  -out "$OUT/leaf.pem" >/dev/null 2>&1
openssl verify -CAfile "$OUT/ca.pem" "$OUT/leaf.pem"
chmod 0600 "$OUT/"*.key
echo 'DISPOSABLE_TLS_CREATED: ephemeral, test-only, no system trust modifications'
