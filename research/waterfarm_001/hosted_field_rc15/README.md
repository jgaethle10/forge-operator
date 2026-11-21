# Evercraft Aqua Field Notebook RC15: first-party hosted PWA candidate

This is a research-stage, read-only installable website package. NOT deployed,
NOT published, NOT encrypted, NOT a verified farm measurement or water-savings tool.

## Install on approved Evercraft-owned HTTPS infrastructure only
Place this directory under one stable first-party HTTPS origin/path (for example
`https://<approved Evercraft domain>/aqua/`, chosen by the owner). Serve
`index.html`, manifest, JS and SW as static same-origin assets with correct MIME types.
Do not use third-party app-builder runtimes or public third-party API dependencies.

Test offline install using a local browser on localhost, which is considered a secure context.
Once approved site is online, open it in Safari, choose Share > Add to Home Screen.
This is different from opening a `file://` attachment or ChatGPT file preview.

## Storage and data limits
- IndexedDB is transactional and same-origin: a write must complete before the UI says saved.
- Invalid stored backup refuses to overwrite prior data; unknown/unavailable storage is HOLD.
- Browser-managed storage may be evicted, device lost or site origin changed; it is not
  encrypted, guaranteed persistent, or a replacement for encrypted private backups.
- The app has no data sync, server, user accounts or irrigation controls.
- Every observation is self-reported and is not an authenticated calibrated sensor record.
- Manual encrypted external backup handling is an operator responsibility.
- RC14 file-preview localStorage does not migrate automatically to a hosted origin.
  Export RC14 backup, then import its JSON inside RC15.

## Reproduce checks
`node --test tests/*.test.mjs`. Run `python tests/browser_injected_qa.py` for a DOM-only mock; **hosted-origin** acceptance remains pending and requires running `tests/hosted_acceptance.py` on an authorized workstation. No
GitHub Actions CI or iPhone WebKit device testing is represented here.

## Gate
Do not put live farm records in the public repo or on an unapproved origin.
Site permission, topology, calibration, records retention, security and an independent
professional review remain prerequisites for a real pilot and any savings claims.
